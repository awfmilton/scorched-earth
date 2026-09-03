/**
 * JOIN_ROOM { code }, SET_PROFILE { name, colour }, FIRE { angle, power, weapon }, RESOLVE_SHOT { shotId }, REJOIN { code, playerToken }, SHOP_DONE { inventory, cash }, ELIMINATED { turnNumber, slots }.
 * ROOM_STATE { code, phase, hostSlot, players:[{slot,name,colour,connected,alive}] }, ROUND_START { seed, wind, turnOrder, tanks:[{slot,name,colour,chassis,inventory}], yourSlot }, FIRE_SYNC { shotId, shooterSlot, vx, vy, wind, weapon }, TURN_SYNC { activeSlot, turnNumber }, PLAYER_LEFT { slot }, ROUND_END { winnerSlot, scores }, ERROR { code, message }.
 */

const { MAX_PLAYERS, CHASSIS, isGameMode } = require('./constants.js');

const C2S = Object.freeze({
  CREATE_ROOM: 'CREATE_ROOM',
  JOIN_ROOM: 'JOIN_ROOM',
  SET_PROFILE: 'SET_PROFILE',
  START_GAME: 'START_GAME',
  FIRE: 'FIRE',
  RESOLVE_SHOT: 'RESOLVE_SHOT',
  REJOIN: 'REJOIN',
  LIST_ROOMS: 'LIST_ROOMS',
  // Sent when a player closes the between-round shop. The server starts the
  // next round once every connected player has reported in. Carries the
  // closing inventory, which the server stores and restates to EVERY client in
  // the next ROUND_START — see the note on ELIMINATED below for why a tank's
  // kit has to be replicated rather than kept on the machine that bought it.
  SHOP_DONE: 'SHOP_DONE',
  // A tank died somewhere other than a shot impact.
  //
  // RESOLVE_SHOT.eliminated used to be the only channel by which the server
  // learned a tank had died, and it only fires when a shell resolves. A turret
  // volley at a turn boundary kills outside that window entirely, so the server
  // went on believing the tank was alive: it kept handing the corpse the turn
  // (whose client refuses input on hp <= 0) and never counted the round over.
  // The room wedged with no recovery path.
  //
  // The active client restates the FULL set of slots its simulation shows dead,
  // not the delta, so a single dropped report heals on the next boundary.
  ELIMINATED: 'ELIMINATED',
  // Driving and teleporting move a tank, which changes the world every client
  // simulates. Like FIRE they are INPUTS: the client sends them and applies
  // nothing, and every client (the mover included) acts on the echoed sync.
  MOVE: 'MOVE',
  TELEPORT: 'TELEPORT'
});

const S2C = Object.freeze({
  ROOM_STATE: 'ROOM_STATE',
  ROUND_START: 'ROUND_START',
  FIRE_SYNC: 'FIRE_SYNC',
  TURN_SYNC: 'TURN_SYNC',
  PLAYER_LEFT: 'PLAYER_LEFT',
  ROUND_END: 'ROUND_END',
  ERROR: 'ERROR',
  ROOM_LIST: 'ROOM_LIST',
  MOVE_SYNC: 'MOVE_SYNC',
  TELEPORT_SYNC: 'TELEPORT_SYNC'
});

const ERRORS = Object.freeze({
  UNKNOWN_ROOM: 'UNKNOWN_ROOM',
  ROOM_FULL: 'ROOM_FULL',
  NOT_YOUR_TURN: 'NOT_YOUR_TURN',
  ALREADY_FIRED: 'ALREADY_FIRED',
  NOT_HOST: 'NOT_HOST',
  NOT_ENOUGH_PLAYERS: 'NOT_ENOUGH_PLAYERS',
  COLOUR_TAKEN: 'COLOUR_TAKEN',
  BAD_MESSAGE: 'BAD_MESSAGE',
  RATE_LIMITED: 'RATE_LIMITED'
});

// A tank's kit, as its owner reports it and as the server restates it.
//
// Bounded on every axis because the value is relayed verbatim to every other
// player, exactly like `colour` and `chassis`: an unbounded object here would
// let one client push arbitrary payload weight through the room. Counts must be
// finite non-negative integers — Infinity does not survive JSON (it stringifies
// to null), so the client omits its infinite Baby Missile stock and rebuilds it
// from the base loadout instead of shipping it.
// Sized against the FULL honest catalogue — every weapon (36), every item
// (~14) and every purchasable structure key (10) — with real headroom. At 64
// this sat 4 keys from a wedge: an honest full kit whose declaration failed
// isInventory() had its SHOP_DONE rejected outright, and the room then
// waited on that player forever.
const MAX_INVENTORY_KEYS = 128;
const MAX_INVENTORY_KEY_LEN = 32;
const MAX_INVENTORY_COUNT = 99999;

function isInventory(val) {
  if (typeof val !== 'object' || val === null || Array.isArray(val)) return false;
  const keys = Object.keys(val);
  if (keys.length > MAX_INVENTORY_KEYS) return false;
  return keys.every(k =>
    k.length <= MAX_INVENTORY_KEY_LEN &&
    Number.isInteger(val[k]) && val[k] >= 0 && val[k] <= MAX_INVENTORY_COUNT
  );
}

const schemas = {
  // C2S
  [C2S.CREATE_ROOM]: {
    isPublic: (val) => typeof val === 'boolean' || val === undefined,
    // The ONLY point at which a client gets a say in the mode. After the room
    // exists the value is the server's, and every joiner inherits it.
    mode: (val) => val === undefined || isGameMode(val)
  },
  [C2S.LIST_ROOMS]: {},
  [C2S.JOIN_ROOM]: {
    code: (val) => typeof val === 'string' && val.length === 4
  },
  [C2S.SET_PROFILE]: {
    name: (val) => typeof val === 'string' && val.length <= 16,
    colour: (val) => typeof val === 'string',
    // Optional so an older client that never sends one still validates; the
    // room manager defaults it. Constrained to known ids here AND allowlisted
    // again in setProfile, for the same reason colour is: the value is
    // relayed to every other player and rendered in their lobby.
    chassis: (val) => val === undefined || (typeof val === 'string' && Object.hasOwn(CHASSIS, val))
  },
  [C2S.START_GAME]: {
    config: (val) => typeof val === 'object' && val !== null
  },
  [C2S.FIRE]: {
    angle: (val) => typeof val === 'number' && Number.isFinite(val),
    power: (val) => typeof val === 'number' && Number.isFinite(val),
    weapon: (val) => typeof val === 'string',
    // Which detonator the shooter has armed for this shot.
    //
    // Only the shooter can know this: a client replicates its OWN inventory
    // and nobody else's, so every other client has `undefined` where the
    // shooter has a Proximity Fuse. Clients used to each run armTrigger()
    // locally and were promised they would agree — they cannot, and a shell
    // that detonates 34px early on one screen and on contact on another is a
    // permanent desync. The shooter declares it, the server echoes it.
    trigger: (val) => val === undefined || val === null ||
      val === 'proximity' || val === 'contact'
  },
  [C2S.RESOLVE_SHOT]: {
    shotId: (val) => typeof val === 'string' || (typeof val === 'number' && Number.isFinite(val)),
    eliminated: (val) => Array.isArray(val) && val.length <= MAX_PLAYERS &&
      val.every(v => Number.isInteger(v) && v >= 0 && v < MAX_PLAYERS) &&
      new Set(val).size === val.length
  },
  [C2S.REJOIN]: {
    code: (val) => typeof val === 'string' && val.length === 4,
    playerToken: (val) => typeof val === 'string'
  },
  [C2S.SHOP_DONE]: {
    // Optional: an older build sends none, and the server then keeps whatever
    // it last knew for that slot.
    inventory: (val) => val === undefined || isInventory(val),
    // The bankroll the player leaves the shop with, declared for the same
    // reason the inventory is: it exists on one machine and is ranked, paid
    // and displayed on all of them. Bounded so a hostile client cannot store
    // garbage the server will restate to the whole room.
    cash: (val) => val === undefined ||
      (typeof val === 'number' && Number.isFinite(val) &&
       Number.isInteger(val) && val >= 0 && val <= 100000000)
  },
  [C2S.ELIMINATED]: {
    // The boundary being reported. A frame that does not match the room's
    // current turn is a stale client talking about a world that has moved on,
    // and is dropped rather than applied.
    turnNumber: (val) => typeof val === 'number' && Number.isFinite(val),
    slots: (val) => Array.isArray(val) && val.length <= MAX_PLAYERS &&
      val.every(v => Number.isInteger(v) && v >= 0 && v < MAX_PLAYERS) &&
      new Set(val).size === val.length
  },
  [C2S.MOVE]: {
    // -1 drives left, 1 drives right. Anything else is rejected rather than
    // coerced: a NaN direction would move every client's copy differently.
    dir: (val) => val === -1 || val === 1,
    steps: (val) => typeof val === 'number' && Number.isInteger(val) && val > 0 && val <= 8
  },
  [C2S.TELEPORT]: {},

  // S2C
  [S2C.ROOM_STATE]: {
    code: (val) => typeof val === 'string' && val.length === 4,
    phase: (val) => typeof val === 'string',
    hostSlot: (val) => typeof val === 'number' && Number.isFinite(val),
    players: (val) => Array.isArray(val) && val.every(p =>
      p && typeof p === 'object' && !Array.isArray(p) &&
      typeof p.slot === 'number' && Number.isFinite(p.slot) &&
      typeof p.name === 'string' && p.name.length <= 16 &&
      typeof p.colour === 'string' &&
      typeof p.connected === 'boolean' &&
      typeof p.alive === 'boolean' &&
      (p.chassis === undefined || (typeof p.chassis === 'string' && Object.hasOwn(CHASSIS, p.chassis)))
    ),
    playerToken: (val) => val === undefined || typeof val === 'string',
    yourSlot: (val) => val === undefined || (typeof val === 'number' && Number.isFinite(val)),
    mode: (val) => val === undefined || isGameMode(val)
  },
  [S2C.ROUND_START]: {
    seed: (val) => typeof val === 'number' && Number.isFinite(val),
    wind: (val) => typeof val === 'number' && Number.isFinite(val),
    turnOrder: (val) => Array.isArray(val) && val.every(v => typeof v === 'number' && Number.isFinite(v)),
    tanks: (val) => Array.isArray(val),
    yourSlot: (val) => typeof val === 'number' && Number.isFinite(val),
    config: (val) => typeof val === 'object' && val !== null,
    // Restated next to the seed on purpose. Both are inputs to the shared
    // simulation, and a client that guessed either one would desync silently.
    mode: (val) => val === undefined || isGameMode(val),
    // 1-based. Round 2+ tells the client to keep cash and inventory rather
    // than rebuilding the roster from scratch.
    round: (val) => typeof val === 'number' && Number.isFinite(val),
    totalRounds: (val) => typeof val === 'number' && Number.isFinite(val),
    // Set on a mid-round rejoin. The world this ROUND_START rebuilds is the one
    // the seed described at round start, not the one the room is actually in,
    // so the client sits the round out rather than firing into a fiction.
    spectating: (val) => typeof val === 'boolean'
  },
  [S2C.FIRE_SYNC]: {
    shotId: (val) => typeof val === 'string' || (typeof val === 'number' && Number.isFinite(val)),
    shooterSlot: (val) => typeof val === 'number' && Number.isFinite(val),
    // The clamped inputs, echoed back. Clients use `angle` only to place the
    // barrel tip via the deterministic trig pair; the trajectory itself always
    // integrates the server's vx/vy.
    angle: (val) => typeof val === 'number' && Number.isFinite(val),
    power: (val) => typeof val === 'number' && Number.isFinite(val),
    vx: (val) => typeof val === 'number' && Number.isFinite(val),
    vy: (val) => typeof val === 'number' && Number.isFinite(val),
    wind: (val) => typeof val === 'number' && Number.isFinite(val),
    weapon: (val) => typeof val === 'string',
    // The armed detonator, echoed to everyone so all clients fuse the shell
    // the same way. Absent means a plain impact fuse.
    trigger: (val) => val === undefined || val === null ||
      val === 'proximity' || val === 'contact'
  },
  [S2C.TURN_SYNC]: {
    activeSlot: (val) => typeof val === 'number' && Number.isFinite(val),
    turnNumber: (val) => typeof val === 'number' && Number.isFinite(val),
    // Present only under the 'changing-mid-round' wind policy: the boundary
    // mints a fresh wind exactly as FIRE mints the per-shot one.
    wind: (val) => typeof val === 'number' && Number.isFinite(val)
  },
  [S2C.PLAYER_LEFT]: {
    slot: (val) => typeof val === 'number' && Number.isFinite(val)
  },
  [S2C.ROUND_END]: {
    winnerSlot: (val) => val === null || (typeof val === 'number' && Number.isFinite(val)),
    scores: (val) => Array.isArray(val) || (typeof val === 'object' && val !== null),
    // Absent means "match is over" for older clients, which only ever saw the
    // single-round flow. Present and false means a shop intermission follows.
    matchOver: (val) => typeof val === 'boolean',
    round: (val) => typeof val === 'number' && Number.isFinite(val),
    totalRounds: (val) => typeof val === 'number' && Number.isFinite(val)
  },
  [S2C.MOVE_SYNC]: {
    slot: (val) => typeof val === 'number' && Number.isFinite(val),
    dir: (val) => val === -1 || val === 1,
    steps: (val) => typeof val === 'number' && Number.isInteger(val) && val > 0
  },
  [S2C.TELEPORT_SYNC]: {
    slot: (val) => typeof val === 'number' && Number.isFinite(val),
    // The destination column is minted by the SERVER, not drawn from the
    // shared RNG stream. Consuming gameplayRNG for it would advance the stream
    // on clients that process the teleport at a different point in their
    // simulation, and every later draw would then disagree.
    x: (val) => typeof val === 'number' && Number.isFinite(val)
  },
  [S2C.ERROR]: {
    code: (val) => typeof val === 'string',
    message: (val) => typeof val === 'string'
  },
  [S2C.ROOM_LIST]: {
    rooms: (val) => Array.isArray(val) && val.every(r => 
      r && typeof r === 'object' && 
      typeof r.code === 'string' &&
      typeof r.players === 'number' &&
      typeof r.maxPlayers === 'number' &&
      typeof r.hostName === 'string'
    )
  }
};

// Fields that may be absent per message type. Absent is valid; when present,
// the schema validator still runs.
const optionalFields = {
  [C2S.START_GAME]: new Set(['config']),
  [C2S.RESOLVE_SHOT]: new Set(['eliminated']),
  [C2S.SHOP_DONE]: new Set(['inventory', 'cash']),
  [C2S.CREATE_ROOM]: new Set(['isPublic', 'mode']),
  // A classic-mode client never sends a chassis, and neither does an older
  // build. Declaring a schema key makes it required unless it is listed here,
  // so the permissive predicate alone was not enough.
  [C2S.SET_PROFILE]: new Set(['chassis']),
  // An older build sends no trigger, and most shots have none to send.
  [C2S.FIRE]: new Set(['trigger']),
  [S2C.FIRE_SYNC]: new Set(['trigger']),
  [S2C.ROOM_STATE]: new Set(['playerToken', 'yourSlot', 'config', 'mode']),
  [S2C.TURN_SYNC]: new Set(['wind']),
  [S2C.ROUND_START]: new Set(['config', 'round', 'totalRounds', 'mode', 'spectating']),
  [S2C.ROUND_END]: new Set(['matchOver', 'round', 'totalRounds'])
};

function validate(msg) {
  if (typeof msg !== 'object' || msg === null || Array.isArray(msg)) {
    return { ok: false, error: 'Message must be an object' };
  }

  if (typeof msg.type !== 'string') {
    return { ok: false, error: 'Message type must be a string' };
  }

  const isC2S = Object.values(C2S).includes(msg.type);
  const isS2C = Object.values(S2C).includes(msg.type);
  if (!isC2S && !isS2C) {
    return { ok: false, error: `Unknown message type: ${msg.type}` };
  }

  const schema = schemas[msg.type];
  const optional = optionalFields[msg.type];
  for (const [field, validator] of Object.entries(schema)) {
    if (!(field in msg)) {
      if (optional && optional.has(field)) continue;
      return { ok: false, error: `Missing required field: ${field}` };
    }
    if (!validator(msg[field])) {
      return { ok: false, error: `Invalid value or type for field: ${field}` };
    }
  }

  return { ok: true, msg };
}

/**
 * Strips an inventory down to the entries that are safe to store and relay.
 * The server never trusts a count — the trust boundary is the same one
 * RESOLVE_SHOT.eliminated and MOVE's fuel already sit behind: a client that
 * lies about its own kit cheats, but every client is told the SAME lie and so
 * none of them desync. What this does guarantee is that no client can push an
 * unbounded or malformed object through the room at everybody else.
 * An object that survives the type check always yields an object back, even an
 * empty one: {} is a REAL declaration ("I hold nothing"), and the caller stores
 * it. null is reserved for absent or non-object input — the only case where the
 * server keeps a slot's previous kit instead of replacing it. Conflating the two
 * would let an emptied-out kit be restated from the last richer declaration and
 * silently refunded to a tank that had spent it.
 * @param {*} val
 * @returns {Object|null} a fresh plain object, or null if the input is not one
 */
function sanitiseInventory(val) {
  if (typeof val !== 'object' || val === null || Array.isArray(val)) return null;
  const out = {};
  let kept = 0;
  for (const key of Object.keys(val)) {
    if (kept >= MAX_INVENTORY_KEYS) break;
    if (typeof key !== 'string' || key.length === 0 || key.length > MAX_INVENTORY_KEY_LEN) continue;
    const count = val[key];
    if (!Number.isInteger(count) || count < 0 || count > MAX_INVENTORY_COUNT) continue;
    out[key] = count;
    kept++;
  }
  return out;
}

/**
 * Strips a host's START_GAME config down to the allowlisted, bounded fields.
 * The blob used to be relayed verbatim to every client in ROUND_START, which
 * made it a free channel for arbitrary payload (and let a host smuggle a
 * gameMode into a room the server had pinned to the other one — the client
 * defends against that too, but the wire should never carry it).
 * Unknown fields are dropped, invalid values fall back to the defaults the
 * clients already apply for absent fields.
 */
const CONFIG_WALL_TYPES = new Set(['off', 'rubber', 'wrap', 'concrete']);
const CONFIG_WIND_MODES = new Set(['changing-per-round', 'changing-mid-round', 'constant', 'none']);
const CONFIG_TERRAIN_STYLES = new Set(['random', 'mountains', 'plains', 'hills', 'plateau']);
const CONFIG_LEVELS = new Set(['normal', 'high', 'low']);

function sanitiseConfig(val) {
  if (typeof val !== 'object' || val === null || Array.isArray(val)) return {};
  const out = {};
  // Numeric fields CLAMP rather than drop: a host that typed 9999 rounds
  // meant "a long match", not "whatever the default is". Non-numbers drop.
  const clampNum = (v, lo, hi) =>
    (typeof v === 'number' && Number.isFinite(v)) ? Math.min(hi, Math.max(lo, v)) : undefined;
  const rounds = clampNum(val.rounds, 1, 20);
  if (rounds !== undefined) out.rounds = Math.floor(rounds);
  const cash = clampNum(val.startingCash, 0, 100000000);
  if (cash !== undefined) out.startingCash = Math.floor(cash);
  const gravity = clampNum(val.gravity, 10, 1000);
  if (gravity !== undefined) out.gravity = gravity;
  if (typeof val.wallType === 'string' && CONFIG_WALL_TYPES.has(val.wallType)) out.wallType = val.wallType;
  if (val.weaponsAvailability === 'all' || val.weaponsAvailability === 'basic') out.weaponsAvailability = val.weaponsAvailability;
  if (typeof val.windVariability === 'string' && CONFIG_WIND_MODES.has(val.windVariability)) out.windVariability = val.windVariability;
  if (typeof val.terrainStyle === 'string' && CONFIG_TERRAIN_STYLES.has(val.terrainStyle)) out.terrainStyle = val.terrainStyle;
  if (typeof val.hillCount === 'string' && CONFIG_LEVELS.has(val.hillCount)) out.hillCount = val.hillCount;
  if (typeof val.flatness === 'string' && CONFIG_LEVELS.has(val.flatness)) out.flatness = val.flatness;
  return out;
}

module.exports = {
  C2S,
  S2C,
  ERRORS,
  validate,
  sanitiseInventory,
  sanitiseConfig
};
