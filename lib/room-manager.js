const crypto = require('node:crypto');
const roomCode = require('./room-code');
const { ERRORS, sanitiseInventory, sanitiseConfig } = require('./protocol');
const {
  RETRO_COLORS, AETHERCASTLE_COLORS, CLASSIC_COLORS, paletteFor,
  DEFAULT_MODE, normaliseMode,
  WORLD_W, WORLD_MARGIN, WEAPON_IDS, BASIC_WEAPON_IDS,
  CHASSIS, DEFAULT_CHASSIS, chassisAllowedIn
} = require('./constants');

const KNOWN_WEAPONS = new Set(WEAPON_IDS);
const BASIC_WEAPONS = new Set(BASIC_WEAPON_IDS);

// The weapon accept-list is PER ROOM, driven by the tier the host chose at
// START_GAME. It used to be the flat KNOWN_WEAPONS set for every room, which
// made "Basic" a client-side suggestion: a modified client could fire a
// Meganuke into a Basic room and every honest client would faithfully simulate
// it, because clients simulate whatever FIRE_SYNC broadcasts.
//
// An out-of-tier weapon is downgraded rather than rejected, matching what
// already happens to an unknown weapon id. Rejecting would be defensible too,
// but a downgrade cannot wedge the turn, and no honest client can reach this
// path at all — the shop never offers an out-of-tier weapon to buy.
function allowedWeapons(room) {
  const availability = room && room.config && room.config.weaponsAvailability;
  return availability === 'basic' ? BASIC_WEAPONS : KNOWN_WEAPONS;
}

// The only colour strings a client may ever set. Everything the server relays
// into another player's DOM has to come from a fixed set, not from the wire.
// Both palettes are allowed regardless of mode: colour is relayed and drawn,
// never simulated, so a cross-palette pick is a cosmetic oddity rather than a
// desync — and keeping one flat set avoids a rejection if a client's palette
// is a build behind the server's.
const ALLOWED_COLOURS = new Set(
  [...AETHERCASTLE_COLORS, ...CLASSIC_COLORS].map(c => c.value)
);

// One connection may not hoard rooms. Without a cap a single socket can spam
// CREATE_ROOM until the 4-character code space is exhausted.
const MAX_ROOMS_PER_CONNECTION = 4;

/**
 * Rejections carry a protocol ERROR code on `.code` so the transport can put
 * it straight into an S2C ERROR frame without matching on message text.
 * @param {string} code
 * @returns {Error}
 */
function roomError(code) {
  const err = new Error(code);
  err.code = code;
  return err;
}

class RoomManager {
  constructor() {
    this.rooms = new Map();
    // connectionId -> Set<room>. Lookup index only — the room's player map
    // stays the source of truth. Entries are validated lazily on read (the
    // room must still be registered and must still seat this connectionId),
    // so unbind bookkeeping never has to chase every mutation site.
    this.roomsByConnection = new Map();
  }

  bindConnection(connectionId, room) {
    let set = this.roomsByConnection.get(connectionId);
    if (!set) {
      set = new Set();
      this.roomsByConnection.set(connectionId, set);
    }
    set.add(room);
  }

  /**
   * Helper to serialize a room object for JSON payload delivery.
   * Converts the Map of players into an array of player objects.
   *
   * ROOM_STATE is broadcast to every player in the room, so this carries only
   * the fields in the protocol's ROOM_STATE schema. `playerToken` is a
   * REJOIN credential and `connectionId` is server-internal — including either
   * would hand every player the means to resume another player's slot.
   * A player's own token is delivered once, in the reply addressed to them.
   *
   * @param {Object} room
   * @returns {Object} JSON-friendly room representation
   */
  serializeRoom(room) {
    return {
      code: room.code,
      phase: room.phase,
      hostSlot: room.hostSlot,
      players: Array.from(room.players.values()).map(p => ({
        slot: p.slot,
        name: p.name,
        colour: p.colour,
        chassis: p.chassis || DEFAULT_CHASSIS,
        connected: p.connected,
        alive: p.alive,
        // Back in the room but sitting out the rest of the round. Their world
        // is rebuilt from the seed alone, so it cannot be trusted until the
        // next round re-seeds everyone. See rejoin().
        spectating: p.spectating === true,
        roundsWon: p.roundsWon || 0
      })),
      round: room.currentRound || 1,
      totalRounds: room.totalRounds || 1,
      mode: normaliseMode(room.mode),
      createdAt: room.createdAt
    };
  }

  /**
   * One entry in ROUND_START.tanks. Single source for all three construction
   * sites (match start, next round, rejoin) so a field can never be echoed on
   * one path and dropped on another — which is exactly how `chassis` came to be
   * sent by the server and quietly ignored by the client.
   *
   * `inventory` is what the owner declared when it closed the last shop. It is
   * restated to every client because the simulation reads it on every client:
   * the turn-boundary shield raise, the Battery heal, Auto Defense's mid-blast
   * replacement shield and the Parachute that eats a fall are all inventory
   * lookups, and each one silently forks the world when only one machine holds
   * the data. Omitted on round 1 and for any slot that never reported, leaving
   * clients on the base loadout they build identically.
   *
   * @param {Object} p seated player
   * @returns {Object}
   */
  tankEntry(p) {
    const entry = {
      slot: p.slot,
      name: p.name,
      colour: p.colour,
      chassis: p.chassis || DEFAULT_CHASSIS
    };
    if (p.inventory) entry.inventory = p.inventory;
    // Declared at SHOP_DONE. Omitted until the owner first declares (round 1),
    // leaving every client on the startingCash they all agree on.
    if (Number.isFinite(p.cash)) entry.cash = p.cash;
    return entry;
  }

  /**
   * Helper to find a room by a connection ID.
   * @param {string} connectionId
   * @returns {Object|null} The room object or null
   */
  getRoomByConnection(connectionId) {
    const rooms = this.getRoomsByConnection(connectionId);
    return rooms.length ? rooms[0] : null;
  }

  /**
   * Every room this connection is seated in. disconnect() must clean all of
   * them, not just the first: a leftover connected:true player pins a room
   * open forever, because sweep() never reaps a room with a connected player.
   * @param {string} connectionId
   * @returns {Array<Object>} rooms
   */
  getRoomsByConnection(connectionId) {
    // Index read with lazy validation. This used to be an O(rooms) scan on
    // EVERY gameplay message, which made squatted rooms a CPU denial of
    // service (measured: 2.5ms per lookup behind 50k rooms). Validation is
    // O(players-per-room) <= 4: a stale entry — swept room, superseded
    // connection — is dropped the first time it is read.
    const set = this.roomsByConnection.get(connectionId);
    if (!set) return [];
    const found = [];
    for (const room of set) {
      let seated = false;
      if (this.rooms.get(room.code) === room) {
        for (const player of room.players.values()) {
          if (player.connectionId === connectionId) {
            seated = true;
            break;
          }
        }
      }
      if (seated) found.push(room);
      else set.delete(room);
    }
    if (set.size === 0) this.roomsByConnection.delete(connectionId);
    return found;
  }

  /**
   * @param {string} connectionId
   * @returns {number} How many rooms this connection currently occupies
   */
  countRoomsForConnection(connectionId) {
    return this.getRoomsByConnection(connectionId).length;
  }

  /**
   * Helper to remove a room by its code.
   * @param {string} code
   * @returns {boolean} True if deleted, false if not found
   */
  removeRoom(code) {
    return this.rooms.delete(roomCode.normalize(code));
  }

  /**
   * Creates a new game room and seats the creator at slot 0 as host.
   * @param {string} connectionId
   * @param {boolean} isPublic
   * @returns {Object} { replies, broadcasts }
   */
  createRoom(connectionId, isPublic = false, mode = DEFAULT_MODE) {
    // Cap how many rooms one socket can hold open. Combined with the sweep
    // this bounds room growth from a single unauthenticated connection.
    if (this.countRoomsForConnection(connectionId) >= MAX_ROOMS_PER_CONNECTION) {
      throw roomError(ERRORS.BAD_MESSAGE);
    }

    // Global backstop: connections are effectively free to mint, so the
    // per-connection cap alone never bounded the aggregate. Well above any
    // honest population, far below the 4-letter code space an attacker
    // would need to squat.
    if (this.rooms.size >= RoomManager.MAX_TOTAL_ROOMS) {
      throw roomError(ERRORS.RATE_LIMITED);
    }

    const code = roomCode.generateUnique((candidate) => this.rooms.has(candidate));
    // Choose seed: a 32-bit unsigned integer
    const seed = crypto.randomInt(0, 0x100000000);
    // Choose wind: server-side between -150 and 150 inclusive
    const wind = crypto.randomInt(-150, 151);

    // Pinned here and never reassigned. Everything downstream reads room.mode
    // rather than taking a mode off the wire, which is what makes it
    // impossible for two players in one room to be running different games.
    const roomMode = normaliseMode(mode);
    const palette = paletteFor(roomMode);

    const playerToken = crypto.randomBytes(16).toString('hex');
    const players = new Map();
    const hostSlot = 0;

    players.set(hostSlot, {
      slot: hostSlot,
      connectionId,
      playerToken,
      name: `Player 1`,
      colour: palette[hostSlot].value,
      chassis: DEFAULT_CHASSIS,
      connected: true,
      alive: true,
      // Declared at SHOP_DONE, restated in ROUND_START.tanks. Null until then.
      inventory: null
    });

    const room = {
      code,
      phase: 'lobby',
      isPublic,
      mode: roomMode,
      seed,
      wind,
      hostSlot,
      players,
      createdAt: Date.now()
    };

    this.rooms.set(code, room);
    this.bindConnection(connectionId, room);

    return {
      replies: [{
        to: connectionId,
        msg: {
          type: 'ROOM_STATE',
          ...this.serializeRoom(room),
          playerToken,
          yourSlot: hostSlot
        }
      }],
      broadcasts: []
    };
  }

  /**
   * Lists available public rooms.
   * @param {string} connectionId
   * @returns {Object} { replies, broadcasts }
   */
  listRooms(connectionId) {
    const rooms = [];
    for (const room of this.rooms.values()) {
      if (room.phase === 'lobby' && room.isPublic && room.players.size < 4) {
        const host = Array.from(room.players.values()).find(p => p.slot === room.hostSlot);
        rooms.push({
          code: room.code,
          players: room.players.size,
          maxPlayers: 4,
          hostName: host ? host.name : 'Unknown'
        });
      }
    }
    return {
      replies: [{
        to: connectionId,
        msg: {
          type: 'ROOM_LIST',
          rooms
        }
      }],
      broadcasts: []
    };
  }

  /**
   * Joins an existing room at the lowest free slot.
   * @param {string} connectionId
   * @param {string} code
   * @returns {Object} { replies, broadcasts }
   */
  join(connectionId, code) {
    const room = this.rooms.get(roomCode.normalize(code));
    if (!room) {
      throw roomError(ERRORS.UNKNOWN_ROOM);
    }

    // A room that has left the lobby is not joinable. There is no distinct
    // protocol code for this yet, so it reads as UNKNOWN_ROOM to the client —
    // which is also what we want to tell a stranger guessing at codes.
    if (room.phase !== 'lobby') {
      throw roomError(ERRORS.UNKNOWN_ROOM);
    }

    if (room.players.size >= 4) {
      throw roomError(ERRORS.ROOM_FULL);
    }

    // One connection, one seat. Without this a single socket could send
    // JOIN_ROOM repeatedly and take every remaining slot, locking real
    // players out of a public room it found via LIST_ROOMS.
    for (const p of room.players.values()) {
      if (p.connectionId === connectionId) {
        throw roomError(ERRORS.BAD_MESSAGE);
      }
    }

    // Seat at the lowest free slot
    let slot = -1;
    for (let s = 0; s < 4; s++) {
      if (!room.players.has(s)) {
        slot = s;
        break;
      }
    }

    if (slot === -1) {
      throw roomError(ERRORS.ROOM_FULL);
    }

    const playerToken = crypto.randomBytes(16).toString('hex');
    const player = {
      slot,
      connectionId,
      playerToken,
      name: `Player ${slot + 1}`,
      colour: paletteFor(room.mode)[slot].value,
      chassis: DEFAULT_CHASSIS,
      connected: true,
      alive: true,
      // Declared at SHOP_DONE, restated in ROUND_START.tanks. Null until then.
      inventory: null
    };

    room.players.set(slot, player);
    this.bindConnection(connectionId, room);

    const allConnectionIds = Array.from(room.players.values()).map(p => p.connectionId);
    const serializedRoom = this.serializeRoom(room);

    return {
      replies: [{
        to: connectionId,
        msg: {
          type: 'ROOM_STATE',
          ...serializedRoom,
          playerToken,
          yourSlot: slot
        }
      }],
      broadcasts: [{
        to: allConnectionIds,
        msg: {
          type: 'ROOM_STATE',
          ...serializedRoom
        }
      }]
    };
  }

  /**
   * Updates a player's name and/or colour.
   * @param {string} connectionId
   * @param {Object} profile { name, colour }
   * @returns {Object} { replies, broadcasts }
   */
  setProfile(connectionId, { name, colour, chassis }) {
    const room = this.getRoomByConnection(connectionId);
    if (!room) {
      throw roomError(ERRORS.UNKNOWN_ROOM);
    }

    let player = null;
    for (const p of room.players.values()) {
      if (p.connectionId === connectionId) {
        player = p;
        break;
      }
    }

    if (!player) {
      throw roomError('PLAYER_NOT_FOUND');
    }

    // Sanitise the name
    let sanitisedName = (name || '').trim();
    // Strip control characters
    sanitisedName = sanitisedName.replace(/[\x00-\x1F\x7F-\x9F]/g, '');
    if (sanitisedName.length > 16) {
      sanitisedName = sanitisedName.slice(0, 16);
    }

    // The colour is relayed to every other player and lands in their DOM, so
    // it must be one of the palette values and nothing else. Accepting an
    // arbitrary string here was a stored XSS: a hand-rolled client could send
    // `#fff"><img src=x onerror=...>` and run script in every lobby member's
    // browser. There is no length cap that makes an arbitrary string safe —
    // only an allowlist does.
    if (colour !== undefined && colour !== null && colour !== '') {
      if (typeof colour !== 'string' || !ALLOWED_COLOURS.has(colour)) {
        throw roomError(ERRORS.BAD_MESSAGE);
      }
      for (const p of room.players.values()) {
        if (p.connectionId !== connectionId && p.connected && p.colour === colour) {
          throw roomError(ERRORS.COLOUR_TAKEN);
        }
      }
    }

    // Same allowlist reasoning as colour, plus a mode gate. The chassis id is
    // relayed to every other player AND selects a movement model, so an
    // unknown value would have two clients simulating the same tank
    // differently — and a chassis that this mode does not field (an airship in
    // a classic room) would have them simulating a vehicle the mode is not
    // supposed to contain at all.
    if (chassis !== undefined && chassis !== null && chassis !== '') {
      if (typeof chassis !== 'string' || !chassisAllowedIn(room.mode, chassis)) {
        throw roomError(ERRORS.BAD_MESSAGE);
      }
    }

    if (sanitisedName) {
      player.name = sanitisedName;
    }
    if (colour) {
      player.colour = colour;
    }
    if (chassis) {
      player.chassis = chassis;
    }

    const allConnectionIds = Array.from(room.players.values()).map(p => p.connectionId);
    const serializedRoom = this.serializeRoom(room);

    return {
      replies: [],
      broadcasts: [{
        to: allConnectionIds,
        msg: {
          type: 'ROOM_STATE',
          ...serializedRoom
        }
      }]
    };
  }

  /**
   * Starts a game round.
   * @param {string} connectionId
   * @param {Object} config
   * @returns {Object} { replies, broadcasts }
   */
  start(connectionId, config) {
    const room = this.getRoomByConnection(connectionId);
    if (!room) {
      throw roomError(ERRORS.UNKNOWN_ROOM);
    }

    let callerPlayer = null;
    for (const p of room.players.values()) {
      if (p.connectionId === connectionId) {
        callerPlayer = p;
        break;
      }
    }

    if (!callerPlayer) {
      throw roomError('PLAYER_NOT_FOUND');
    }

    if (callerPlayer.slot !== room.hostSlot) {
      throw roomError(ERRORS.NOT_HOST);
    }

    // A room already in play must not be reset by a second START_GAME.
    if (room.phase !== 'lobby') {
      throw roomError(ERRORS.BAD_MESSAGE);
    }

    // ALL validations precede ANY mutation: a START_GAME that is going to
    // throw (wrong host, wrong phase, too few players) must leave the room
    // exactly as it found it — an early rejected attempt used to zero the
    // round-1 wind permanently.
    const connectedCount = Array.from(room.players.values()).filter(p => p.connected).length;
    if (connectedCount < 2) {
      throw roomError(ERRORS.NOT_ENOUGH_PLAYERS);
    }

    // Config is written only AFTER the caller is confirmed to be the host.
    // Writing it first let any player in the room overwrite the host's match
    // settings simply by sending START_GAME and eating the NOT_HOST error.
    // Allowlisted and bounded before it is stored or relayed: the host's
    // blob reaches every client in ROUND_START, and an unvalidated field is
    // a free payload channel through the server.
    room.config = sanitiseConfig(config);

    // Wind policy. The room's round-1 wind was minted at creation, before
    // the host chose a variability; apply the choice before round 1's
    // ROUND_START restates it. Two-sided so the assignment is re-entrant:
    // 'none' pins zero, anything else restores a live breeze if a previous
    // attempt (or an unlucky mint) left it at zero. Nothing has been
    // broadcast yet, so re-minting here is invisible.
    if (room.config.windVariability === 'none') {
      room.wind = 0;
    } else if (room.wind === 0) {
      room.wind = crypto.randomInt(-150, 151);
    }

    // Start playing
    room.phase = 'playing';
    room.turnNumber = 1;
    room.awaitingResolution = false;

    // Match structure. A match is N rounds; each round ends at last-tank-
    // standing and is followed by a shop intermission, except the last.
    const requestedRounds = room.config && Number(room.config.rounds);
    room.totalRounds = Number.isFinite(requestedRounds)
      ? Math.max(1, Math.min(20, Math.floor(requestedRounds)))
      : 5;
    room.currentRound = 1;
    for (const p of room.players.values()) {
      p.roundsWon = 0;
      p.alive = true;
      p.spectating = false;
      // Round 1 predates any shop, so every tank starts on the base loadout the
      // clients build themselves. Clearing here also stops a previous match's
      // kit leaking into a rematch played in the same room.
      p.inventory = null;
    }

    // Set turn order from seated slots ascending
    const turnOrder = Array.from(room.players.keys()).sort((a, b) => a - b);
    room.turnOrder = turnOrder;
    room.activeSlot = turnOrder[0];
    room.turnStartedAt = Date.now();

    const tanks = Array.from(room.players.values()).map(p => this.tankEntry(p));

    // Tailor one ROUND_START message per connected recipient
    const broadcasts = [];
    for (const p of room.players.values()) {
      if (p.connected) {
        broadcasts.push({
          to: [p.connectionId],
          msg: {
            type: 'ROUND_START',
            seed: room.seed,
            wind: room.wind,
            turnOrder,
            tanks,
            yourSlot: p.slot,
            mode: normaliseMode(room.mode),
            config: room.config,
            round: 1,
            totalRounds: room.totalRounds
          }
        });
      }
    }

    // Round 1 announces its cursor with the same TURN_SYNC(1) that
    // startNextRound sends for every later round. This is what makes turn 1
    // UNAMBIGUOUS: every client applies boundary 1 up front and records
    // turnNumber=1, so the TURN_SYNC(1) a mid-round-1 rejoin restates is
    // deduped instead of running a phantom boundary (drift, auras, turret
    // volleys) on the rejoining client alone.
    const allConnectionIds = Array.from(room.players.values())
      .filter(p => p.connected)
      .map(p => p.connectionId);
    broadcasts.push({
      to: allConnectionIds,
      msg: {
        type: 'TURN_SYNC',
        activeSlot: room.activeSlot,
        turnNumber: room.turnNumber
      }
    });

    return {
      replies: [],
      broadcasts
    };
  }

  /**
   * Processes player disconnect, marking them disconnected, updating host/turns,
   * or parking the room if no active connected players remain.
   * @param {string} connectionId
   * @returns {Object} { replies, broadcasts }
   */
  disconnect(connectionId) {
    // Clean EVERY room the connection occupies. Releasing only the first left
    // permanent connected:true ghosts in the others, and a room with a ghost
    // is never swept.
    const rooms = this.getRoomsByConnection(connectionId);
    if (rooms.length === 0) {
      return { replies: [], broadcasts: [] };
    }

    const replies = [];
    const broadcasts = [];
    for (const room of rooms) {
      const result = this.disconnectFromRoom(room, connectionId);
      replies.push(...result.replies);
      broadcasts.push(...result.broadcasts);
    }
    return { replies, broadcasts };
  }

  /**
   * Releases one connection's seat in one room.
   * @param {Object} room
   * @param {string} connectionId
   * @returns {Object} { replies, broadcasts }
   */
  disconnectFromRoom(room, connectionId) {
    let disconnectedPlayer = null;
    for (const p of room.players.values()) {
      if (p.connectionId === connectionId) {
        disconnectedPlayer = p;
        break;
      }
    }

    if (!disconnectedPlayer) {
      return { replies: [], broadcasts: [] };
    }

    const slot = disconnectedPlayer.slot;

    // Set the player's connected = false.
    disconnectedPlayer.connected = false;

    // In lobby phase, removing the slot outright is acceptable.
    // We choose to remove the slot from room.players in the lobby phase to free it up for other players.
    if (room.phase === 'lobby') {
      room.players.delete(slot);
    }

    // If they held hostSlot, transfer host to the lowest connected slot so a lobby is never left unstartable.
    if (room.hostSlot === slot) {
      let lowestConnectedSlot = -1;
      for (const p of room.players.values()) {
        if (p.connected) {
          if (lowestConnectedSlot === -1 || p.slot < lowestConnectedSlot) {
            lowestConnectedSlot = p.slot;
          }
        }
      }
      if (lowestConnectedSlot !== -1) {
        room.hostSlot = lowestConnectedSlot;
      }
    }

    const broadcasts = [];
    const allConnectionIds = Array.from(room.players.values()).map(p => p.connectionId);

    // Broadcast PLAYER_LEFT { slot }
    broadcasts.push({
      to: allConnectionIds,
      msg: {
        type: 'PLAYER_LEFT',
        slot
      }
    });

    // If the dropped player held activeSlot, clear awaitingResolution and advance via nextTurn(room)
    let nextTurnResult = null;
    if (room.phase === 'playing' && room.activeSlot === slot) {
      room.awaitingResolution = false;
      nextTurnResult = this.nextTurn(room);
    } else if (room.phase === 'shopping') {
      // Readiness is measured over connected players, so losing one can be
      // the event that completes the set. Without this the remaining players
      // sit in the shop forever waiting on someone who already left.
      if (room.readyForNextRound) {
        room.readyForNextRound.delete(slot);
      }
      nextTurnResult = this.maybeBeginNextRound(room);
    }

    // Any non-lobby room that has just lost its last connected player must be
    // stamped so sweep() can reap it. nextTurn() does this for 'playing', but
    // a room abandoned during the shop intermission has no other path to a
    // timestamp and would leak its object and its 4-letter code forever.
    if (room.phase !== 'lobby' && room.pausedAt === undefined) {
      const stillConnected = Array.from(room.players.values()).some(p => p.connected);
      if (!stillConnected) {
        room.pausedAt = Date.now();
      }
    }

    // Broadcast a refreshed ROOM_STATE
    broadcasts.push({
      to: allConnectionIds,
      msg: {
        type: 'ROOM_STATE',
        ...this.serializeRoom(room)
      }
    });

    if (nextTurnResult) {
      broadcasts.push(...nextTurnResult.broadcasts);
    }

    return {
      replies: nextTurnResult ? nextTurnResult.replies : [],
      broadcasts
    };
  }

  /**
   * Fires a projectile with server-computed shot vector.
   * @param {string} connectionId
   * @param {Object} payload { angle, power, weapon }
   * @returns {Object} { replies, broadcasts }
   */
  fire(connectionId, payload) {
    const room = this.getRoomByConnection(connectionId);
    if (!room) {
      throw roomError(ERRORS.UNKNOWN_ROOM);
    }

    let callerPlayer = null;
    for (const p of room.players.values()) {
      if (p.connectionId === connectionId) {
        callerPlayer = p;
        break;
      }
    }

    if (!callerPlayer) {
      throw roomError(ERRORS.UNKNOWN_ROOM);
    }

    if (room.phase !== 'playing') {
      throw roomError(ERRORS.NOT_YOUR_TURN);
    }

    if (!callerPlayer.alive) {
      throw roomError(ERRORS.NOT_YOUR_TURN);
    }

    // Same backstop as requireActivePlayer: a spectator's FIRE would make
    // every client simulate a shot authored from a fictional world.
    if (callerPlayer.spectating) {
      throw roomError(ERRORS.NOT_YOUR_TURN);
    }

    if (callerPlayer.slot !== room.activeSlot) {
      throw roomError(ERRORS.NOT_YOUR_TURN);
    }

    if (room.awaitingResolution) {
      throw roomError(ERRORS.ALREADY_FIRED);
    }

    let angle, power, weapon, trigger;
    if (payload && typeof payload === 'object') {
      angle = payload.angle;
      power = payload.power;
      weapon = payload.weapon;
      trigger = payload.trigger;
    } else {
      angle = arguments[1];
      power = arguments[2];
      weapon = arguments[3];
    }

    if (!Number.isFinite(angle) || !Number.isFinite(power)) {
      throw roomError(ERRORS.BAD_MESSAGE);
    }

    const clampedAngle = Math.min(180, Math.max(0, angle));
    const clampedPower = Math.min(1000, Math.max(0, power));

    // Fallback to 'Baby Missile' if the weapon id is unknown OR outside the
    // tier this room was started with.
    const allowed = allowedWeapons(room);
    const chosenWeapon = (weapon && allowed.has(weapon)) ? weapon : 'Baby Missile';

    // The detonator, normalised to the closed set before it is broadcast.
    // Anything else becomes a plain impact fuse rather than being trusted
    // through: clients switch on this value, so an unknown string would have
    // each of them fall through to whatever their own default happens to be.
    const chosenTrigger = (trigger === 'proximity' || trigger === 'contact')
      ? trigger
      : null;

    room.awaitingResolution = true;
    // Deadline stamp for sweep(): a shooter that vanishes mid-flight would
    // otherwise hold awaitingResolution forever and wedge the room.
    room.shotFiredAt = Date.now();
    room.nextShotId = (room.nextShotId || 0) + 1;
    const shotId = room.nextShotId;

    const angleRad = (clampedAngle * Math.PI) / 180;
    /*
     * Math.sin/Math.cos/Math.pow are not bit-identical across JS engines, but + - * / are.
     * Computing the velocity vector once on the server means every client integrates the same trajectory with exact arithmetic instead of diverging.
     * Clients must never recompute the vector from angle/power.
     */
    const vx = clampedPower * Math.cos(angleRad);
    const vy = -clampedPower * Math.sin(angleRad);

    const allConnectionIds = Array.from(room.players.values()).map(p => p.connectionId);

    return {
      replies: [],
      broadcasts: [{
        to: allConnectionIds,
        msg: {
          type: 'FIRE_SYNC',
          shotId,
          shooterSlot: callerPlayer.slot,
          angle: clampedAngle,
          power: clampedPower,
          vx,
          vy,
          wind: room.wind,
          weapon: chosenWeapon,
          trigger: chosenTrigger
        }
      }]
    };
  }

  /**
   * Resolves a projectile impact, advancing the turn.
   * @param {string} connectionId
   * @param {Object} payload { shotId, eliminated? }
   * @returns {Object} { replies, broadcasts }
   */
  resolveShot(connectionId, payload) {
    const room = this.getRoomByConnection(connectionId);
    if (!room) {
      throw roomError(ERRORS.UNKNOWN_ROOM);
    }

    let callerPlayer = null;
    for (const p of room.players.values()) {
      if (p.connectionId === connectionId) {
        callerPlayer = p;
        break;
      }
    }

    if (!callerPlayer) {
      throw roomError(ERRORS.UNKNOWN_ROOM);
    }

    const shotId = (payload && typeof payload === 'object') ? payload.shotId : arguments[1];

    if (callerPlayer.slot !== room.activeSlot) {
      return { replies: [], broadcasts: [] };
    }

    if (shotId !== room.nextShotId) {
      return { replies: [], broadcasts: [] };
    }

    if (!room.awaitingResolution) {
      return { replies: [], broadcasts: [] };
    }

    room.awaitingResolution = false;

    // Apply shooter-reported eliminations. The frame was already shape-validated
    // by lib/protocol.js: absent means nobody died. Unknown slots (e.g. a stale
    // client reporting a player who left) and already-dead slots are silently
    // skipped - never thrown.
    const eliminated = (payload && typeof payload === 'object' && Array.isArray(payload.eliminated))
      ? payload.eliminated
      : [];
    for (const slot of eliminated) {
      const victim = room.players.get(slot);
      if (!victim || victim.alive === false) {
        continue;
      }
      victim.alive = false;
    }

    return this.nextTurn(room);
  }

  /**
   * Deaths that happened away from a shell impact — today that means a turret
   * volley or an oil-vat breach fired by the structures pass at a turn
   * boundary, both of which can take a tank from alive to zero without any
   * RESOLVE_SHOT to carry the news.
   *
   * Left unreported the server keeps a corpse on the board: it hands that slot
   * the turn (and the owning client refuses input on hp <= 0, so nobody can
   * move), and its alive-count never falls to the one survivor that ends the
   * round. The room wedges permanently with every player still connected, so
   * sweep() never reaps it either.
   *
   * AUTHORITY. Same as resolveShot: the active player and nobody else. Every
   * client simulates the same boundary and could report it, but letting any of
   * them declare any slot dead at any moment is a strictly wider trust boundary
   * than the one this codebase already accepts, and it buys nothing — the
   * cursor always points at a connected player, so there is always exactly one
   * client entitled to speak.
   *
   * IDEMPOTENT AND SELF-HEALING. The client restates every slot it sees dead,
   * not the ones that died just now, so a report lost to a disconnect is
   * repaired by the next boundary rather than stranding the room. Slots that
   * are unknown or already dead are skipped in silence, exactly as
   * RESOLVE_SHOT.eliminated does.
   *
   * @param {string} connectionId
   * @param {Object} payload { turnNumber, slots }
   * @returns {Object} { replies, broadcasts }
   */
  reportEliminated(connectionId, payload) {
    const room = this.getRoomByConnection(connectionId);
    if (!room) {
      throw roomError(ERRORS.UNKNOWN_ROOM);
    }

    let callerPlayer = null;
    for (const p of room.players.values()) {
      if (p.connectionId === connectionId) {
        callerPlayer = p;
        break;
      }
    }
    if (!callerPlayer) {
      throw roomError(ERRORS.UNKNOWN_ROOM);
    }

    // Everything below is a quiet no-op rather than an error: a boundary report
    // races the round ending and the turn moving on, and a client that is a
    // frame late is behaving correctly, not misbehaving.
    if (room.phase !== 'playing') {
      return { replies: [], broadcasts: [] };
    }
    if (callerPlayer.slot !== room.activeSlot) {
      return { replies: [], broadcasts: [] };
    }
    // A shell still in the air belongs to RESOLVE_SHOT, which reports its own
    // kills. Accepting a boundary report here would advance the turn out from
    // under a projectile every client is mid-integration on.
    if (room.awaitingResolution) {
      return { replies: [], broadcasts: [] };
    }
    // A frame about a turn the room has already left describes a world that no
    // longer exists.
    if (!payload || payload.turnNumber !== (room.turnNumber || 1)) {
      return { replies: [], broadcasts: [] };
    }

    const slots = Array.isArray(payload.slots) ? payload.slots : [];
    let changed = false;
    for (const slot of slots) {
      const victim = room.players.get(slot);
      if (!victim || victim.alive === false) continue;
      victim.alive = false;
      changed = true;
    }

    if (!changed) {
      return { replies: [], broadcasts: [] };
    }

    // The cursor is only rebuilt when this round's deaths actually invalidated
    // it — the round is over, or the tank holding the turn is the one that
    // died. A bystander dying leaves the turn where it is, and re-broadcasting
    // it would burn a turnNumber that every client would then dedupe away.
    const alivePlayers = Array.from(room.players.values()).filter(p => p.alive);
    const activeStillAlive = room.players.get(room.activeSlot);
    if (alivePlayers.length <= 1 || !activeStillAlive || !activeStillAlive.alive) {
      return this.nextTurn(room);
    }

    return { replies: [], broadcasts: [] };
  }

  /**
   * Turn authority for the inputs only the active player may send. Shared by
   * move() and teleport(); fire() predates it and keeps its own copy.
   * @param {string} connectionId
   * @returns {Object} { room, player }
   */
  requireActivePlayer(connectionId) {
    const room = this.getRoomByConnection(connectionId);
    if (!room) {
      throw roomError(ERRORS.UNKNOWN_ROOM);
    }

    let callerPlayer = null;
    for (const p of room.players.values()) {
      if (p.connectionId === connectionId) {
        callerPlayer = p;
        break;
      }
    }
    if (!callerPlayer) {
      throw roomError(ERRORS.UNKNOWN_ROOM);
    }
    if (room.phase !== 'playing') {
      throw roomError(ERRORS.NOT_YOUR_TURN);
    }
    if (!callerPlayer.alive) {
      throw roomError(ERRORS.NOT_YOUR_TURN);
    }
    // A spectator's world is its own reconstruction; letting it author an
    // input would make everyone simulate a fiction. The turn cursor should
    // never point here (rejoin advances it), so this is the backstop.
    if (callerPlayer.spectating) {
      throw roomError(ERRORS.NOT_YOUR_TURN);
    }
    if (callerPlayer.slot !== room.activeSlot) {
      throw roomError(ERRORS.NOT_YOUR_TURN);
    }
    // Repositioning after the shell has left the barrel would rewrite the
    // world underneath a projectile every client is already integrating.
    if (room.awaitingResolution) {
      throw roomError(ERRORS.ALREADY_FIRED);
    }

    return { room, player: callerPlayer };
  }

  /**
   * Drive the active tank. The server does not model terrain, so it relays the
   * INPUT (direction and step count) rather than a destination; every client
   * runs the same deterministic drive and arrives at the same place.
   *
   * Fuel is not tracked here. The server has no view of the shop, so it cannot
   * know what a player bought; clients all deduct the same cost from the same
   * relayed step count, so a client that lies about its fuel cheats but does
   * not desync anyone. Same trust boundary as RESOLVE_SHOT's eliminated list.
   * @param {string} connectionId
   * @param {Object} payload { dir, steps }
   * @returns {Object} { replies, broadcasts }
   */
  move(connectionId, payload) {
    const { room, player } = this.requireActivePlayer(connectionId);

    const dir = payload ? payload.dir : undefined;
    const steps = payload ? payload.steps : undefined;
    if (dir !== -1 && dir !== 1) {
      throw roomError(ERRORS.BAD_MESSAGE);
    }
    if (!Number.isInteger(steps) || steps <= 0) {
      throw roomError(ERRORS.BAD_MESSAGE);
    }

    // Cap the burst so one message cannot teleport a tank across the map.
    const grantedSteps = Math.min(steps, 8);
    const allConnectionIds = Array.from(room.players.values()).map(p => p.connectionId);

    return {
      replies: [],
      broadcasts: [{
        to: allConnectionIds,
        msg: {
          type: 'MOVE_SYNC',
          slot: player.slot,
          dir,
          steps: grantedSteps
        }
      }]
    };
  }

  /**
   * Teleport the active tank to a random column. The destination is minted
   * here, exactly as seed and wind are, and broadcast. Drawing it from the
   * clients' shared RNG stream instead would advance that stream at a point
   * that depends on local timing, and every later draw would disagree.
   * @param {string} connectionId
   * @returns {Object} { replies, broadcasts }
   */
  teleport(connectionId) {
    const { room, player } = this.requireActivePlayer(connectionId);

    const x = crypto.randomInt(WORLD_MARGIN, WORLD_W - WORLD_MARGIN);
    const allConnectionIds = Array.from(room.players.values()).map(p => p.connectionId);

    return {
      replies: [],
      broadcasts: [{
        to: allConnectionIds,
        msg: {
          type: 'TELEPORT_SYNC',
          slot: player.slot,
          x
        }
      }]
    };
  }

  /**
   * Standings for the match so far. Sent with every ROUND_END so clients can
   * render a table between rounds instead of guessing at who is winning.
   * @param {Object} room
   * @returns {Array<Object>}
   */
  buildScores(room) {
    return Array.from(room.players.values())
      .map(p => ({
        slot: p.slot,
        name: p.name,
        colour: p.colour,
        roundsWon: p.roundsWon || 0,
        alive: p.alive,
        connected: p.connected
      }))
      .sort((a, b) => b.roundsWon - a.roundsWon || a.slot - b.slot);
  }

  /**
   * A player has closed the between-round shop. Once every connected player
   * has reported in, the next round starts.
   * @param {string} connectionId
   * @returns {Object} { replies, broadcasts }
   */
  shopDone(connectionId, payload) {
    const room = this.getRoomByConnection(connectionId);
    if (!room) {
      throw roomError(ERRORS.UNKNOWN_ROOM);
    }
    if (room.phase !== 'shopping') {
      throw roomError(ERRORS.BAD_MESSAGE);
    }

    let callerPlayer = null;
    for (const p of room.players.values()) {
      if (p.connectionId === connectionId) {
        callerPlayer = p;
        break;
      }
    }
    if (!callerPlayer) {
      throw roomError('PLAYER_NOT_FOUND');
    }

    // The kit this player leaves the shop with. Only its owner can know it —
    // buying is local and there is no per-purchase wire message — so the owner
    // declares it here and the server restates it to EVERY client in the next
    // ROUND_START. Without that, a shield, Battery, Auto Defense or Parachute
    // exists on exactly one machine while the simulation that reads it runs on
    // all of them, and the world silently forks. Absent (older build) keeps
    // whatever was last known rather than wiping the slot.
    // A SPECTATOR'S declaration is fiction and must not become the room's
    // truth. Their world was rebuilt from the round seed alone, so the
    // round-end payouts their client computed — the cash they think they
    // hold, the kills they think they earned — happened in a reconstruction
    // nobody else simulated. They are still COUNTED (readiness below) so
    // the room advances, but the seat keeps its last-known kit and bankroll
    // and re-declares from a real world next round.
    if (!callerPlayer.spectating) {
      const declared = payload && typeof payload === 'object'
        ? sanitiseInventory(payload.inventory)
        : null;
      if (declared) {
        callerPlayer.inventory = declared;
      }

      // The bankroll rides along for the same reason the kit does: only the
      // owner knows what they left the shop with, and every client ranks and
      // pays it. Bounds were already enforced by lib/protocol.js; the floor
      // here is belt-and-braces against a direct API caller.
      if (payload && typeof payload === 'object' &&
          Number.isFinite(payload.cash) && payload.cash >= 0) {
        callerPlayer.cash = Math.min(100000000, Math.floor(payload.cash));
      }
    }

    room.readyForNextRound = room.readyForNextRound || new Set();
    room.readyForNextRound.add(callerPlayer.slot);

    return this.maybeBeginNextRound(room);
  }

  /**
   * Starts the next round if every connected player is out of the shop.
   * Readiness counts CONNECTED players only: a player who drops during the
   * intermission must not hold the remaining players hostage forever.
   * @param {Object} room
   * @returns {Object} { replies, broadcasts }
   */
  maybeBeginNextRound(room) {
    if (room.phase !== 'shopping') {
      return { replies: [], broadcasts: [] };
    }

    const connected = Array.from(room.players.values()).filter(p => p.connected);
    if (connected.length === 0) {
      return { replies: [], broadcasts: [] };
    }
    const ready = room.readyForNextRound || new Set();
    if (!connected.every(p => ready.has(p.slot))) {
      return { replies: [], broadcasts: [] };
    }

    room.currentRound = (room.currentRound || 1) + 1;
    room.phase = 'playing';
    room.turnNumber = 1;
    room.awaitingResolution = false;
    room.readyForNextRound = new Set();

    // Fresh world for the new round. Both values are minted here, server-side,
    // and broadcast — exactly as round 1 does — so every client builds the
    // same terrain and integrates the same wind. Wind honours the host's
    // variability setting: 'none' pins it to zero, 'constant' carries the
    // match's original draw forward, everything else redraws per round.
    room.seed = crypto.randomInt(0, 0x100000000);
    const windMode = room.config && room.config.windVariability;
    if (windMode === 'none') {
      room.wind = 0;
    } else if (windMode !== 'constant') {
      room.wind = crypto.randomInt(-150, 151);
    }

    // Everyone is back in play, including anyone eliminated last round and
    // anyone who has been sitting out as a spectator since reconnecting. The
    // fresh seed above is exactly what makes that safe: every client rebuilds
    // this round's world from the same number, so a spectator's stale board is
    // discarded rather than reconciled.
    for (const p of room.players.values()) {
      p.alive = true;
      p.spectating = false;
    }

    // Rotate who shoots first so the first-mover advantage does not sit with
    // the same slot every round.
    const turnOrder = room.turnOrder && room.turnOrder.length
      ? room.turnOrder
      : Array.from(room.players.keys()).sort((a, b) => a - b);
    room.turnOrder = turnOrder;
    const offset = (room.currentRound - 1) % turnOrder.length;
    let activeSlot = turnOrder[offset];
    // Skip straight past anyone who is not connected to take the shot.
    for (let i = 0; i < turnOrder.length; i++) {
      const candidate = turnOrder[(offset + i) % turnOrder.length];
      const player = room.players.get(candidate);
      if (player && player.connected) {
        activeSlot = candidate;
        break;
      }
    }
    room.activeSlot = activeSlot;
    room.turnStartedAt = Date.now();

    const tanks = Array.from(room.players.values()).map(p => this.tankEntry(p));

    const broadcasts = [];
    for (const p of room.players.values()) {
      if (p.connected) {
        broadcasts.push({
          to: [p.connectionId],
          msg: {
            type: 'ROUND_START',
            seed: room.seed,
            wind: room.wind,
            turnOrder,
            tanks,
            yourSlot: p.slot,
            mode: normaliseMode(room.mode),
            config: room.config || {},
            round: room.currentRound,
            totalRounds: room.totalRounds || 1
          }
        });
      }
    }

    // ROUND_START implies turnOrder[0] is up. Round 2+ rotates the opener, so
    // the real cursor has to ship alongside it or every client drives the
    // wrong tank for the first turn of the round.
    const allConnectionIds = Array.from(room.players.values())
      .filter(p => p.connected)
      .map(p => p.connectionId);
    if (allConnectionIds.length) {
      broadcasts.push({
        to: allConnectionIds,
        msg: {
          type: 'TURN_SYNC',
          activeSlot: room.activeSlot,
          turnNumber: room.turnNumber
        }
      });
    }

    return { replies: [], broadcasts };
  }

  /**
   * Advances the active slot to the next alive player or ends the round.
   * @param {Object} room
   * @returns {Object} { replies, broadcasts }
   */
  nextTurn(room) {
    const alivePlayers = Array.from(room.players.values()).filter(p => p.alive);

    if (alivePlayers.length <= 1) {
      const winnerSlot = alivePlayers.length === 1 ? alivePlayers[0].slot : null;
      const allConnectionIds = Array.from(room.players.values()).map(p => p.connectionId);

      if (winnerSlot !== null) {
        const winner = room.players.get(winnerSlot);
        if (winner) winner.roundsWon = (winner.roundsWon || 0) + 1;
      }

      const round = room.currentRound || 1;
      const totalRounds = room.totalRounds || 1;
      const matchOver = round >= totalRounds;

      if (matchOver) {
        room.phase = 'ended';
        // Stamp the end so sweep() can reap it. Without this an ended room has
        // no pausedAt, fails the sweep's timestamp test forever, and every
        // completed match leaks a room object and its 4-letter code.
        room.pausedAt = Date.now();
      } else {
        // Shop intermission. The next round begins once every connected
        // player has sent SHOP_DONE.
        room.phase = 'shopping';
        room.readyForNextRound = new Set();
      }

      return {
        replies: [],
        broadcasts: [{
          to: allConnectionIds,
          msg: {
            type: 'ROUND_END',
            winnerSlot,
            scores: this.buildScores(room),
            matchOver,
            round,
            totalRounds
          }
        }]
      };
    }

    const currentIndex = room.turnOrder.indexOf(room.activeSlot);
    let nextActiveSlot = -1;
    for (let i = 1; i <= room.turnOrder.length; i++) {
      const nextIndex = (currentIndex + i) % room.turnOrder.length;
      const slot = room.turnOrder[nextIndex];
      const player = room.players.get(slot);
      // A spectating player reconnected mid-round and rebuilt their world from
      // the seed alone, so their terrain, hp and holding are all fiction until
      // the next round. Handing them the turn would let that fiction author a
      // FIRE the rest of the room has to simulate.
      if (player && player.alive && player.connected && !player.spectating) {
        nextActiveSlot = slot;
        break;
      }
    }

    if (nextActiveSlot === -1) {
      room.phase = 'paused';
      room.pausedAt = Date.now();
      return { replies: [], broadcasts: [] };
    }

    room.activeSlot = nextActiveSlot;
    room.turnNumber = (room.turnNumber || 1) + 1;
    room.turnStartedAt = Date.now();

    // Mid-round wind is minted per boundary, exactly as the per-shot wind is
    // minted per FIRE, and rides the TURN_SYNC so every client applies it at
    // the same point in the turn.
    const midRoundWind = room.config &&
      room.config.windVariability === 'changing-mid-round';
    if (midRoundWind) {
      room.wind = crypto.randomInt(-150, 151);
    }

    const allConnectionIds = Array.from(room.players.values()).map(p => p.connectionId);

    const turnSync = {
      type: 'TURN_SYNC',
      activeSlot: room.activeSlot,
      turnNumber: room.turnNumber
    };
    if (midRoundWind) {
      turnSync.wind = room.wind;
    }

    return {
      replies: [],
      broadcasts: [{
        to: allConnectionIds,
        msg: turnSync
      }]
    };
  }

  /**
   * Re-seed the CURRENT round of a fully-parked room.
   *
   * Mirrors startNextRound's world-minting — fresh seed and wind, everyone
   * revived and un-spectated, kits and bankrolls kept from their last real
   * declarations — but the round counter and rounds-won are untouched: the
   * abandoned round is replayed, not skipped. Called only from rejoin()
   * when NO other player is seated live, so nobody's in-progress world is
   * being discarded.
   * @param {Object} room
   * @returns {Object} { replies, broadcasts }
   */
  reseedCurrentRound(room) {
    room.phase = 'playing';
    delete room.pausedAt;
    room.turnNumber = 1;
    room.awaitingResolution = false;
    room.readyForNextRound = new Set();
    room.seed = crypto.randomInt(0, 0x100000000);
    const windMode = room.config && room.config.windVariability;
    if (windMode === 'none') {
      room.wind = 0;
    } else if (windMode !== 'constant') {
      room.wind = crypto.randomInt(-150, 151);
    }

    for (const p of room.players.values()) {
      p.alive = true;
      p.spectating = false;
    }

    const turnOrder = room.turnOrder && room.turnOrder.length
      ? room.turnOrder
      : Array.from(room.players.keys()).sort((a, b) => a - b);
    room.turnOrder = turnOrder;
    // Same opener rotation startNextRound applies, connected-first.
    const offset = ((room.currentRound || 1) - 1) % turnOrder.length;
    let activeSlot = turnOrder[offset];
    for (let i = 0; i < turnOrder.length; i++) {
      const candidate = turnOrder[(offset + i) % turnOrder.length];
      const candidatePlayer = room.players.get(candidate);
      if (candidatePlayer && candidatePlayer.connected) {
        activeSlot = candidate;
        break;
      }
    }
    room.activeSlot = activeSlot;
    room.turnStartedAt = Date.now();

    const tanks = Array.from(room.players.values()).map(p => this.tankEntry(p));
    const connected = Array.from(room.players.values()).filter(p => p.connected);
    const broadcasts = [];
    for (const p of connected) {
      broadcasts.push({
        to: [p.connectionId],
        msg: {
          type: 'ROUND_START',
          seed: room.seed,
          wind: room.wind,
          turnOrder,
          tanks,
          yourSlot: p.slot,
          mode: normaliseMode(room.mode),
          config: room.config,
          round: room.currentRound || 1,
          totalRounds: room.totalRounds || 1
        }
      });
    }
    broadcasts.push({
      to: connected.map(p => p.connectionId),
      msg: {
        type: 'TURN_SYNC',
        activeSlot: room.activeSlot,
        turnNumber: room.turnNumber
      }
    });

    return { replies: [], broadcasts };
  }

  /**
   * Reclaims a slot for a disconnected player.
   * @param {string} connectionId
   * @param {Object} payload { code, playerToken }
   * @returns {Object} { replies, broadcasts }
   */
  rejoin(connectionId, { code, playerToken }) {
    if (!code || !playerToken) {
      throw roomError(ERRORS.UNKNOWN_ROOM);
    }

    const room = this.rooms.get(roomCode.normalize(code));
    if (!room) {
      throw roomError(ERRORS.UNKNOWN_ROOM);
    }

    // 'shopping' is a live phase too — a player who drops during the
    // between-round intermission must be able to come back to their match.
    if (room.phase !== 'playing' && room.phase !== 'paused' && room.phase !== 'shopping') {
      throw roomError(ERRORS.UNKNOWN_ROOM);
    }

    let player = null;
    for (const p of room.players.values()) {
      if (p.playerToken === playerToken) {
        player = p;
        break;
      }
    }

    if (!player) {
      throw roomError(ERRORS.UNKNOWN_ROOM);
    }

    /*
     * `connected` may still be true here. After an unclean network blip the
     * dead socket lingers as "connected" until the heartbeat reaps it (up to
     * two cycles), while the player's fresh socket REJOINs immediately —
     * refusing that rejoin stranded the player outside their own match with
     * no retry. The token proves this is the same player, so a fresh socket
     * SUPERSEDES the stale binding: once connectionId is rebound below, the
     * old socket's eventual 'close' matches no player and disconnect()
     * ignores it.
     */

    // Success: rebind the new connectionId and mark connected
    player.connectionId = connectionId;
    player.connected = true;
    this.bindConnection(connectionId, room);

    const otherConnected = Array.from(room.players.values())
      .some(p => p.slot !== player.slot && p.connected);

    /*
     * SPECTATE UNTIL THE NEXT ROUND.
     *
     * The server is a relay, not a simulation: it holds the seed and the turn
     * cursor and nothing else. There is no terrain, no tank hp and no holding
     * here to send a returning player, and lib/structures.js forbids adding a
     * wire message to carry one. So a mid-round rejoiner cannot be restored —
     * they can only be REBUILT from the round seed, which reproduces the world
     * as it was at round start: pristine terrain, full-hp tanks, every
     * structure unbreached. Every peer is meanwhile carrying a round's worth of
     * craters and damage. Letting that client fire would author a FIRE the rest
     * of the room must simulate, computed against a world only it can see.
     *
     * So they come back as a spectator: seated, connected, counted for the
     * shop, but skipped by the turn cursor until the next round re-seeds
     * everyone. The divergence still exists on their screen — it is now
     * bounded, announced, and self-healing at the round boundary, instead of
     * silent and permanent.
     *
     * A parked room is the exception: nobody was able to act, so there is no
     * peer world to be out of step with, and the rejoiner becomes the reference
     * client rather than a spectator. 'shopping' is likewise safe — the next
     * round is about to re-seed the world for everyone anyway.
     */
    // Un-park if paused
    let cursorReassigned = false;
    let nextTurnResult = null;

    if (room.phase === 'playing' && otherConnected) {
      // Spectating only makes sense while someone else can still act. If
      // every OTHER seat is dead, dropped or already spectating, marking
      // this one too would leave nextTurn() nothing to advance to — the
      // room parked itself with players connected, unreachable by both the
      // sweep's un-wedge (playing-only) and its reaper (connected players
      // block it). The rejoiner instead becomes the reference client, the
      // same exception the parked-room path below has always made.
      const otherEligible = Array.from(room.players.values()).some(p =>
        p.slot !== player.slot && p.alive && p.connected && !p.spectating);

      if (otherEligible) {
        player.spectating = true;

        // A spectator can hold the cursor: the supersede path rejoins a
        // player whose seat was never released, so unlike the disconnect
        // path nothing has advanced activeSlot off them.
        if (room.activeSlot === player.slot) {
          if (room.awaitingResolution) {
            // Their shot is still integrating on every other client, and
            // its RESOLVE_SHOT will never come (the resolver's world was
            // just rebuilt). Do NOT clear the pending resolution — that
            // silently discarded the shot's kills AND made resolveShot
            // drop the frame when it did arrive. Leave it pending: the
            // sweep's shot-resolution timeout force-advances with a clean
            // no-elimination resolution in at most 90 seconds.
          } else {
            nextTurnResult = this.nextTurn(room);
            cursorReassigned = true;
          }
        }
      }
    }
    if (room.phase === 'paused') {
      if (!otherConnected) {
        /*
         * FULLY parked: nobody else is seated live, so there is no world to
         * be out of step with. The old answer — resume as the "reference
         * client" on a board rebuilt from the round seed — resumed a
         * FICTION: pristine terrain and full-hp hulls standing in for a
         * half-fought round, and any later rejoiner spectated against that
         * fiction until the next round. Re-seed the CURRENT round instead:
         * fresh seed and wind, everyone revived, kits and bankrolls kept
         * from their last real declarations. Every client that returns
         * builds the same real world; nothing is fiction and nobody
         * spectates it. Rounds won and the round counter are untouched.
         */
        const roomStateReply = {
          to: connectionId,
          msg: {
            type: 'ROOM_STATE',
            ...this.serializeRoom(room),
            playerToken: player.playerToken,
            yourSlot: player.slot
          }
        };
        const reseed = this.reseedCurrentRound(room);
        return { replies: [roomStateReply], broadcasts: reseed.broadcasts };
      }

      room.phase = 'playing';
      delete room.pausedAt;
      // The clock the sweep's turn-timeout reads restarts NOW: the pause
      // may have outlasted TURN_TIMEOUT_MS, and without this restamp the
      // next sweep would immediately force a phantom boundary.
      room.turnStartedAt = Date.now();

      {
        /*
         * Others are connected, yet the room parked — so the cursor is pointing
         * at someone who could not take a turn (dead, dropped, or spectating).
         * Un-parking without re-deriving it hands the room back to a player who
         * will never move, and nothing ever advances it again.
         */
        const cursorPlayer = room.players.get(room.activeSlot);
        const cursorEligible = cursorPlayer && cursorPlayer.alive &&
          cursorPlayer.connected && !cursorPlayer.spectating;
        if (!cursorEligible) {
          nextTurnResult = this.nextTurn(room);
          cursorReassigned = true;
        }
      }
    }

    const allConnectionIds = Array.from(room.players.values()).map(p => p.connectionId);
    const serializedRoom = this.serializeRoom(room);
    const turnNumber = room.turnNumber || 1;

    const broadcasts = [
      {
        to: allConnectionIds,
        msg: {
          type: 'ROOM_STATE',
          ...serializedRoom
        }
      }
    ];

    /*
     * An un-park reassigns activeSlot, so it must announce the cursor exactly like
     * nextTurn() does — otherwise the other clients keep rendering the pre-pause
     * active player.
     */
    if (cursorReassigned && nextTurnResult) {
      // nextTurn already generated TURN_SYNC (or paused it again if no one is alive)
      broadcasts.push(...nextTurnResult.broadcasts);
    } else if (cursorReassigned) {
      broadcasts.push({
        to: allConnectionIds,
        msg: {
          type: 'TURN_SYNC',
          activeSlot: room.activeSlot,
          turnNumber
        }
      });
    }

    const replies = [
      {
        to: connectionId,
        msg: {
          type: 'ROOM_STATE',
          ...serializedRoom,
          playerToken: player.playerToken,
          yourSlot: player.slot
        }
      },
      {
        to: connectionId,
        msg: {
          type: 'ROUND_START',
          seed: room.seed,
          wind: room.wind,
          turnOrder: room.turnOrder,
          tanks: Array.from(room.players.values()).map(p => this.tankEntry(p)),
          yourSlot: player.slot,
          mode: normaliseMode(room.mode),
          config: room.config || {},
          round: room.currentRound || 1,
          totalRounds: room.totalRounds || 1,
          // Tells the returning client that the world it is about to rebuild
          // from the seed is its own private reconstruction, not the room's.
          spectating: player.spectating === true
        }
      }
    ];

    /*
     * ROUND_START carries no cursor, so on its own it reads as "the round is at
     * turnOrder[0]". Ship the live cursor so the resumed client renders the real
     * active player instead of desyncing to the top of the turn order.
     *
     * Only when the broadcast above did not already carry it. An un-park
     * broadcasts TURN_SYNC to every connection INCLUDING this one, and a second
     * copy is not a harmless repeat: the client's turn handler runs the holding's
     * aura, repair and turret pass, which heals tanks, ticks cooldowns and can
     * fire a live volley that carves terrain. Applying it twice on one client and
     * once on every other is a desync manufactured by the reconnect itself.
     */
    if (!cursorReassigned) {
      replies.push({
        to: connectionId,
        msg: {
          type: 'TURN_SYNC',
          activeSlot: room.activeSlot,
          turnNumber: room.turnNumber || 1
        }
      });
    }

    // If rejoining during the shop intermission, the client needs ROUND_END
    // to trigger the shop UI, otherwise it's permanently stuck on the game canvas.
    if (room.phase === 'shopping') {
      replies.push({
        to: connectionId,
        msg: {
          type: 'ROUND_END',
          // winnerSlot is a REQUIRED field on ROUND_END (lib/protocol.js) and is
          // not in optionalFields. A shop intermission has no single winner to
          // report to a late rejoiner, so send the schema's explicit "no winner".
          winnerSlot: null,
          scores: this.buildScores(room),
          matchOver: false,
          round: room.currentRound || 1,
          totalRounds: room.totalRounds || 1
        }
      });
    }

    return {
      replies,
      broadcasts
    };
  }

  /**
   * Sweeps and drops stale rooms based on inactivity/staleness.
   * @param {number} nowMs The current time in milliseconds
   * @returns {Object} { replies, broadcasts, swept }
   */
  sweep(nowMs) {
    const replies = [];
    const broadcasts = [];
    const swept = [];

    for (const [code, room] of this.rooms.entries()) {
      const hasConnected = Array.from(room.players.values()).some(p => p.connected);

      // Un-wedge stalled matches BEFORE the reap checks. A room with
      // connected players is never swept, but it can still be wedged
      // forever by one client that fired and vanished mid-flight (no
      // RESOLVE_SHOT ever arrives) or that sits on its own turn without
      // acting. Both get a deadline; passing it force-advances the cursor
      // exactly as if the shot had resolved with no eliminations, and the
      // resulting TURN_SYNC/ROUND_END flows to every client as usual.
      if (room.phase === 'playing' && hasConnected) {
        const shotStalled = room.awaitingResolution &&
          room.shotFiredAt !== undefined &&
          nowMs - room.shotFiredAt > RoomManager.SHOT_RESOLUTION_TIMEOUT_MS;
        const turnStalled = !room.awaitingResolution &&
          room.turnStartedAt !== undefined &&
          nowMs - room.turnStartedAt > RoomManager.TURN_TIMEOUT_MS;
        if (shotStalled || turnStalled) {
          room.awaitingResolution = false;
          const advanced = this.nextTurn(room);
          if (advanced) {
            replies.push(...(advanced.replies || []));
            broadcasts.push(...(advanced.broadcasts || []));
          }
        }
      }

      // A PAUSED room with players still connected is a black spot for
      // both of this sweep's other jobs: the un-wedge above only runs for
      // 'playing', and the reaper below never touches a room with a
      // connected player. If an eligible actor exists, un-park it exactly
      // as a rejoin would; if nobody can act, it stays parked and the
      // reaper takes it once the players give up and disconnect.
      if (room.phase === 'paused' && hasConnected &&
          room.pausedAt !== undefined &&
          nowMs - room.pausedAt > RoomManager.TURN_TIMEOUT_MS) {
        const eligible = Array.from(room.players.values()).some(p =>
          p.alive && p.connected && !p.spectating);
        if (eligible) {
          room.phase = 'playing';
          delete room.pausedAt;
          room.turnStartedAt = Date.now();
          const unparked = this.nextTurn(room);
          if (unparked) {
            replies.push(...(unparked.replies || []));
            broadcasts.push(...(unparked.broadcasts || []));
          }
        }
      }

      // Universal rule: A room with any connected player is never swept.
      if (hasConnected) {
        continue;
      }

      let shouldSweep = false;

      if (room.phase === 'lobby') {
        // Abandoned lobby: lobby disconnects delete slots, so an empty lobby never gets pausedAt.
        // Drop a lobby room with <2 players when nowMs - createdAt > MAX_LOBBY_MS.
        // A lobby with NO seats at all goes immediately: there is nobody who
        // could come back to it, and letting empties ride out the 15-minute
        // TTL was what let one attacker hold thousands of codes at once.
        const elapsed = nowMs - room.createdAt;
        if (room.players.size === 0 ||
            (room.players.size < 2 && elapsed > RoomManager.MAX_LOBBY_MS)) {
          shouldSweep = true;
        }
      } else {
        // Abandoned mid-game: a fully-disconnected playing room always parks (the last connected leaver drives nextTurn(), setting pausedAt).
        // Drop when pausedAt exists and nowMs - pausedAt > STALE_PAUSED_MS.
        if (room.pausedAt !== undefined) {
          const elapsed = nowMs - room.pausedAt;
          if (elapsed > RoomManager.STALE_PAUSED_MS) {
            shouldSweep = true;
          }
        }
      }

      if (shouldSweep) {
        this.rooms.delete(code);
        swept.push(code);

        // Notify any remaining connectionIds (even though marked disconnected)
        // using an S2C message of type 'ERROR' with code 'ROOM_CLOSED'.
        for (const p of room.players.values()) {
          if (p.connectionId) {
            replies.push({
              to: p.connectionId,
              msg: {
                type: 'ERROR',
                code: 'ROOM_CLOSED',
                message: 'Room was closed due to inactivity.'
              }
            });
          }
        }
      }
    }

    return { replies, broadcasts, swept };
  }
}

RoomManager.STALE_PAUSED_MS = 300000; // 5 minutes
// Aggregate room ceiling — see createRoom.
RoomManager.MAX_TOTAL_ROOMS = 200;
RoomManager.MAX_LOBBY_MS = 900000;    // 15 minutes
// A fired shot must resolve inside this window or sweep() force-advances the
// turn. Generous on purpose: the longest legitimate resolution (napalm burn
// plus settling) is well under half of it.
RoomManager.SHOT_RESOLUTION_TIMEOUT_MS = 90000;  // 90 seconds
// An active player must act inside this window. This is an anti-wedge
// backstop, not a gameplay clock — three minutes of silence means the seat is
// abandoned, not thinking.
RoomManager.TURN_TIMEOUT_MS = 180000; // 3 minutes

module.exports = RoomManager;
