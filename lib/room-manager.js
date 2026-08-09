const crypto = require('node:crypto');
const roomCode = require('./room-code');
const { RETRO_COLORS } = require('./constants');

class RoomManager {
  constructor() {
    this.rooms = new Map();
  }

  /**
   * Helper to serialize a room object for JSON payload delivery.
   * Converts the Map of players into an array of player objects.
   * @param {Object} room
   * @returns {Object} JSON-friendly room representation
   */
  serializeRoom(room) {
    return {
      code: room.code,
      phase: room.phase,
      seed: room.seed,
      wind: room.wind,
      hostSlot: room.hostSlot,
      players: Array.from(room.players.values()).map(p => ({
        slot: p.slot,
        connectionId: p.connectionId,
        playerToken: p.playerToken,
        name: p.name,
        colour: p.colour,
        connected: p.connected,
        alive: p.alive
      })),
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
   * Helper to remove a room by its code.
   * @param {string} code
   * @returns {boolean} True if deleted, false if not found
   */
  removeRoom(code) {
    const normalizedCode = (code || '').trim().toUpperCase();
    return this.rooms.delete(normalizedCode);
  }

  /**
   * Creates a new game room and seats the creator at slot 0 as host.
   * @param {string} connectionId
   * @returns {Object} { replies, broadcasts }
   */
  createRoom(connectionId) {
    const code = roomCode.generateUnique(this.rooms);
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
          room: this.serializeRoom(room),
          playerToken
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
    const normalizedCode = (code || '').trim().toUpperCase();
    const room = this.rooms.get(normalizedCode);
    if (!room) {
      throw new Error('UNKNOWN_ROOM');
    }

    if (room.phase !== 'lobby') {
      throw new Error('ROOM_NOT_LOBBY');
    }

    if (room.players.size >= 4) {
      throw new Error('ROOM_FULL');
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
      throw new Error('ROOM_FULL');
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
          room: serializedRoom,
          playerToken
        }
      }],
      broadcasts: [{
        to: allConnectionIds,
        msg: {
          type: 'ROOM_STATE',
          room: serializedRoom
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
      throw new Error('UNKNOWN_ROOM');
    }

    let player = null;
    for (const p of room.players.values()) {
      if (p.connectionId === connectionId) {
        player = p;
        break;
      }
    }

    if (!player) {
      throw new Error('PLAYER_NOT_FOUND');
    }

    // Sanitise the name
    let sanitisedName = (name || '').trim();
    // Strip control characters
    sanitisedName = sanitisedName.replace(/[\x00-\x1F\x7F-\x9F]/g, '');
    if (sanitisedName.length > 16) {
      sanitisedName = sanitisedName.slice(0, 16);
    }

    // Check if colour is taken by another connected player
    if (colour) {
      for (const p of room.players.values()) {
        if (p.connectionId !== connectionId && p.connected && p.colour === colour) {
          throw new Error('COLOUR_TAKEN');
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
          room: serializedRoom
        }
      }]
    };
  }

  /**
   * Starts a game round.
   * @param {string} connectionId
   * @returns {Object} { replies, broadcasts }
   */
  start(connectionId) {
    const room = this.getRoomByConnection(connectionId);
    if (!room) {
      throw new Error('UNKNOWN_ROOM');
    }

    let callerPlayer = null;
    for (const p of room.players.values()) {
      if (p.connectionId === connectionId) {
        callerPlayer = p;
        break;
      }
    }

    if (!callerPlayer) {
      throw new Error('PLAYER_NOT_FOUND');
    }

    if (callerPlayer.slot !== room.hostSlot) {
      throw new Error('NOT_HOST');
    }

    const connectedCount = Array.from(room.players.values()).filter(p => p.connected).length;
    if (connectedCount < 2) {
      throw new Error('NOT_ENOUGH_PLAYERS');
    }

    // Start playing
    room.phase = 'playing';

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
            yourSlot: p.slot
          }
        });
      }
    }

    return {
      replies: [],
      broadcasts
    };
  }

  /* STUBS FOR FUTURE CHUNKS (Firing, turn advancement, and disconnect handling) */

  disconnect(connectionId) {
    // Leave stub for future chunk
    const room = this.getRoomByConnection(connectionId);
    if (!room) return null;

    for (const p of room.players.values()) {
      if (p.connectionId === connectionId) {
        p.connected = false;
        break;
      }
    }
  }

  fire(connectionId, angle, power, weapon) {
    // Leave stub for future chunk
    return { replies: [], broadcasts: [] };
  }
}

module.exports = RoomManager;
