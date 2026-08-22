const crypto = require('node:crypto');
const roomCode = require('./room-code');
const { ERRORS } = require('./protocol');
const { RETRO_COLORS, WORLD_W, WORLD_MARGIN, WEAPON_IDS, BASIC_WEAPON_IDS } = require('./constants');

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
const ALLOWED_COLOURS = new Set(RETRO_COLORS.map(c => c.value));

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
        connected: p.connected,
        alive: p.alive,
        roundsWon: p.roundsWon || 0
      })),
      round: room.currentRound || 1,
      totalRounds: room.totalRounds || 1,
      createdAt: room.createdAt
    };
  }

  /**
   * Helper to find a room by a connection ID.
   * @param {string} connectionId
   * @returns {Object|null} The room object or null
   */
  getRoomByConnection(connectionId) {
    for (const room of this.rooms.values()) {
      for (const player of room.players.values()) {
        if (player.connectionId === connectionId) {
          return room;
        }
      }
    }
    return null;
  }

  /**
   * Every room this connection is seated in. disconnect() must clean all of
   * them, not just the first: a leftover connected:true player pins a room
   * open forever, because sweep() never reaps a room with a connected player.
   * @param {string} connectionId
   * @returns {Array<Object>} rooms
   */
  getRoomsByConnection(connectionId) {
    const found = [];
    for (const room of this.rooms.values()) {
      for (const player of room.players.values()) {
        if (player.connectionId === connectionId) {
          found.push(room);
          break;
        }
      }
    }
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
  createRoom(connectionId, isPublic = false) {
    // Cap how many rooms one socket can hold open. Combined with the sweep
    // this bounds room growth from a single unauthenticated connection.
    if (this.countRoomsForConnection(connectionId) >= MAX_ROOMS_PER_CONNECTION) {
      throw roomError(ERRORS.BAD_MESSAGE);
    }

    const code = roomCode.generateUnique((candidate) => this.rooms.has(candidate));
    // Choose seed: a 32-bit unsigned integer
    const seed = crypto.randomInt(0, 0x100000000);
    // Choose wind: server-side between -150 and 150 inclusive
    const wind = crypto.randomInt(-150, 151);

    const playerToken = crypto.randomBytes(16).toString('hex');
    const players = new Map();
    const hostSlot = 0;

    players.set(hostSlot, {
      slot: hostSlot,
      connectionId,
      playerToken,
      name: `Player 1`,
      colour: RETRO_COLORS[hostSlot].value,
      connected: true,
      alive: true
    });

    const room = {
      code,
      phase: 'lobby',
      isPublic,
      seed,
      wind,
      hostSlot,
      players,
      createdAt: Date.now()
    };

    this.rooms.set(code, room);

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
      colour: RETRO_COLORS[slot].value,
      connected: true,
      alive: true
    };

    room.players.set(slot, player);

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
  setProfile(connectionId, { name, colour }) {
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

    if (sanitisedName) {
      player.name = sanitisedName;
    }
    if (colour) {
      player.colour = colour;
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

    // Config is written only AFTER the caller is confirmed to be the host.
    // Writing it first let any player in the room overwrite the host's match
    // settings simply by sending START_GAME and eating the NOT_HOST error.
    room.config = config || {};

    const connectedCount = Array.from(room.players.values()).filter(p => p.connected).length;
    if (connectedCount < 2) {
      throw roomError(ERRORS.NOT_ENOUGH_PLAYERS);
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
    }

    // Set turn order from seated slots ascending
    const turnOrder = Array.from(room.players.keys()).sort((a, b) => a - b);
    room.turnOrder = turnOrder;
    room.activeSlot = turnOrder[0];

    const tanks = Array.from(room.players.values()).map(p => ({
      slot: p.slot,
      name: p.name,
      colour: p.colour
    }));

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
            config: room.config,
            round: 1,
            totalRounds: room.totalRounds
          }
        });
      }
    }

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

    if (callerPlayer.slot !== room.activeSlot) {
      throw roomError(ERRORS.NOT_YOUR_TURN);
    }

    if (room.awaitingResolution) {
      throw roomError(ERRORS.ALREADY_FIRED);
    }

    let angle, power, weapon;
    if (payload && typeof payload === 'object') {
      angle = payload.angle;
      power = payload.power;
      weapon = payload.weapon;
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

    room.awaitingResolution = true;
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
          weapon: chosenWeapon
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
  shopDone(connectionId) {
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
    // same terrain and integrates the same wind.
    room.seed = crypto.randomInt(0, 0x100000000);
    room.wind = crypto.randomInt(-150, 151);

    // Everyone is back in play, including anyone eliminated last round.
    for (const p of room.players.values()) {
      p.alive = true;
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

    const tanks = Array.from(room.players.values()).map(p => ({
      slot: p.slot,
      name: p.name,
      colour: p.colour
    }));

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
      if (player && player.alive && player.connected) {
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

    const allConnectionIds = Array.from(room.players.values()).map(p => p.connectionId);

    return {
      replies: [],
      broadcasts: [{
        to: allConnectionIds,
        msg: {
          type: 'TURN_SYNC',
          activeSlot: room.activeSlot,
          turnNumber: room.turnNumber
        }
      }]
    };
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

    if (!player || player.connected) {
      throw roomError(ERRORS.UNKNOWN_ROOM);
    }

    // Success: rebind the new connectionId and mark connected
    player.connectionId = connectionId;
    player.connected = true;

    // Un-park if paused
    let cursorReassigned = false;
    if (room.phase === 'paused') {
      room.phase = 'playing';
      delete room.pausedAt;
      const otherConnected = Array.from(room.players.values()).some(p => p.slot !== player.slot && p.connected);
      if (!otherConnected) {
        room.activeSlot = player.slot;
        cursorReassigned = true;
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
    if (cursorReassigned) {
      broadcasts.push({
        to: allConnectionIds,
        msg: {
          type: 'TURN_SYNC',
          activeSlot: room.activeSlot,
          turnNumber
        }
      });
    }

    return {
      replies: [
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
            tanks: Array.from(room.players.values()).map(p => ({
              slot: p.slot,
              name: p.name,
              colour: p.colour
            })),
            yourSlot: player.slot,
            config: room.config || {},
            round: room.currentRound || 1,
            totalRounds: room.totalRounds || 1
          }
        },
        /*
         * ROUND_START carries no cursor, so on its own it reads as "the round is at
         * turnOrder[0]". Ship the live cursor so the resumed client renders the real
         * active player instead of desyncing to the top of the turn order.
         */
        {
          to: connectionId,
          msg: {
            type: 'TURN_SYNC',
            activeSlot: room.activeSlot,
            turnNumber
          }
        }
      ],
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
      // Universal rule: A room with any connected player is never swept.
      const hasConnected = Array.from(room.players.values()).some(p => p.connected);
      if (hasConnected) {
        continue;
      }

      let shouldSweep = false;

      if (room.phase === 'lobby') {
        // Abandoned lobby: lobby disconnects delete slots, so an empty lobby never gets pausedAt.
        // Drop a lobby room with <2 players when nowMs - createdAt > MAX_LOBBY_MS.
        const elapsed = nowMs - room.createdAt;
        if (room.players.size < 2 && elapsed > RoomManager.MAX_LOBBY_MS) {
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
RoomManager.MAX_LOBBY_MS = 900000;    // 15 minutes

module.exports = RoomManager;
