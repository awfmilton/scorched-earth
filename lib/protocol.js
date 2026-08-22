/**
 * JOIN_ROOM { code }, SET_PROFILE { name, colour }, FIRE { angle, power, weapon }, RESOLVE_SHOT { shotId }, REJOIN { code, playerToken }.
 * ROOM_STATE { code, phase, hostSlot, players:[{slot,name,colour,connected,alive}] }, ROUND_START { seed, wind, turnOrder, tanks, yourSlot }, FIRE_SYNC { shotId, shooterSlot, vx, vy, wind, weapon }, TURN_SYNC { activeSlot, turnNumber }, PLAYER_LEFT { slot }, ROUND_END { winnerSlot, scores }, ERROR { code, message }.
 */

const { MAX_PLAYERS } = require('./constants.js');

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
  // next round once every connected player has reported in.
  SHOP_DONE: 'SHOP_DONE',
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
  BAD_MESSAGE: 'BAD_MESSAGE'
});

const schemas = {
  // C2S
  [C2S.CREATE_ROOM]: {
    isPublic: (val) => typeof val === 'boolean' || val === undefined
  },
  [C2S.LIST_ROOMS]: {},
  [C2S.JOIN_ROOM]: {
    code: (val) => typeof val === 'string' && val.length === 4
  },
  [C2S.SET_PROFILE]: {
    name: (val) => typeof val === 'string' && val.length <= 16,
    colour: (val) => typeof val === 'string'
  },
  [C2S.START_GAME]: {
    config: (val) => typeof val === 'object' && val !== null
  },
  [C2S.FIRE]: {
    angle: (val) => typeof val === 'number' && Number.isFinite(val),
    power: (val) => typeof val === 'number' && Number.isFinite(val),
    weapon: (val) => typeof val === 'string'
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
  [C2S.SHOP_DONE]: {},
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
      typeof p.alive === 'boolean'
    ),
    playerToken: (val) => val === undefined || typeof val === 'string',
    yourSlot: (val) => val === undefined || (typeof val === 'number' && Number.isFinite(val))
  },
  [S2C.ROUND_START]: {
    seed: (val) => typeof val === 'number' && Number.isFinite(val),
    wind: (val) => typeof val === 'number' && Number.isFinite(val),
    turnOrder: (val) => Array.isArray(val) && val.every(v => typeof v === 'number' && Number.isFinite(v)),
    tanks: (val) => Array.isArray(val),
    yourSlot: (val) => typeof val === 'number' && Number.isFinite(val),
    config: (val) => typeof val === 'object' && val !== null,
    // 1-based. Round 2+ tells the client to keep cash and inventory rather
    // than rebuilding the roster from scratch.
    round: (val) => typeof val === 'number' && Number.isFinite(val),
    totalRounds: (val) => typeof val === 'number' && Number.isFinite(val)
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
    weapon: (val) => typeof val === 'string'
  },
  [S2C.TURN_SYNC]: {
    activeSlot: (val) => typeof val === 'number' && Number.isFinite(val),
    turnNumber: (val) => typeof val === 'number' && Number.isFinite(val)
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
  [C2S.CREATE_ROOM]: new Set(['isPublic']),
  [S2C.ROOM_STATE]: new Set(['playerToken', 'yourSlot', 'config']),
  [S2C.ROUND_START]: new Set(['config', 'round', 'totalRounds']),
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

module.exports = {
  C2S,
  S2C,
  ERRORS,
  validate
};
