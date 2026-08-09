class Room {
  constructor(code, options = {}) {
    this.code = code; // normalized
    this.phase = options.phase || 'playing';
    this.seed = options.seed || 'default-seed';
    this.wind = options.wind || 0;
    this.terrainDeformationLog = options.terrainDeformationLog || [];
    this.activeSlot = options.activeSlot !== undefined ? options.activeSlot : 0;
    this.slots = [];
    this.broadcasts = [];
  }

  addPlayer(connectionId, name, playerToken) {
    const slot = {
      connectionId,
      name,
      playerToken,
      connected: true,
      canFire: false
    };
    this.slots.push(slot);
    return slot;
  }

  broadcast(message) {
    this.broadcasts.push(message);
  }
}

class RoomManager {
  constructor() {
    this.rooms = new Map();
  }

  normalizeCode(code) {
    if (!code) return '';
    return code.toLowerCase().trim();
  }

  createRoom(code, options = {}) {
    const norm = this.normalizeCode(code);
    const room = new Room(norm, options);
    this.rooms.set(norm, room);
    return room;
  }

  getRoom(code) {
    return this.rooms.get(this.normalizeCode(code));
  }

  disconnect(connectionId) {
    for (const room of this.rooms.values()) {
      const slot = room.slots.find(s => s.connectionId === connectionId);
      if (slot) {
        slot.connected = false;

        // If no other player is connected, park the room
        const hasConnected = room.slots.some(s => s.connected);
        if (!hasConnected) {
          room.phase = 'parked';
        }

        // Broadcast room state
        const roomState = this._buildRoomState(room);
        room.broadcast(roomState);

        return { room, slot };
      }
    }
    return null;
  }

  _buildRoomState(room) {
    return {
      type: 'ROOM_STATE',
      code: room.code,
      phase: room.phase,
      slots: room.slots.map((s, idx) => ({
        name: s.name,
        connected: s.connected,
        slotNumber: idx
      }))
    };
  }

  rejoin(connectionId, { code, playerToken }) {
    const normCode = this.normalizeCode(code);

    // Find slot with this token across all rooms
    let foundRoom = null;
    let foundSlot = null;
    let foundSlotIndex = -1;

    for (const room of this.rooms.values()) {
      const idx = room.slots.findIndex(s => s.playerToken === playerToken);
      if (idx !== -1) {
        foundRoom = room;
        foundSlot = room.slots[idx];
        foundSlotIndex = idx;
        break;
      }
    }

    if (!foundSlot) {
      throw new Error('Unknown token');
    }

    if (foundRoom.code !== normCode) {
      throw new Error('Token belongs to a different room');
    }

    if (foundSlot.connected) {
      throw new Error('Slot already connected');
    }

    // Check if any other slot is connected before we rejoin
    const anyOtherConnected = foundRoom.slots.some((s, idx) => s.connected && idx !== foundSlotIndex);

    // Rebind connectionId and set connected to true
    foundSlot.connectionId = connectionId;
    foundSlot.connected = true;

    if (foundRoom.phase === 'parked') {
      foundRoom.phase = 'playing';
      if (!anyOtherConnected) {
        foundRoom.activeSlot = foundSlotIndex;
      }
    }

    // Build ROOM_STATE payload
    const roomState = this._buildRoomState(foundRoom);

    // Build resume payload
    const resumePayload = {
      type: 'ROUND_START', // ROUND_START-shaped resume payload
      seed: foundRoom.seed,
      wind: foundRoom.wind,
      terrainDeformationLog: [...foundRoom.terrainDeformationLog],
      activeSlot: foundRoom.activeSlot,
      yourSlot: foundSlotIndex
    };

    // Broadcast refreshed ROOM_STATE to the room so others un-grey
    foundRoom.broadcast(roomState);

    return {
      success: true,
      roomState,
      resumePayload
    };
  }
}

module.exports = {
  Room,
  RoomManager
};
