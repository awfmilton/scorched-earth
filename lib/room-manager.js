const DISCONNECT_THRESHOLD = 300000; // 5 minutes in ms
const MAX_LIFETIME = 900000; // 15 minutes in ms

class RoomManager {
  constructor() {
    this.rooms = new Map();
  }

  createRoom(code, createdAt = 0) {
    const room = {
      code,
      createdAt,
      phase: 'lobby',
      slots: [] // each slot: { id, connected, disconnectedAt }
    };
    this.rooms.set(code, room);
    return room;
  }

  getRoom(code) {
    return this.rooms.get(code);
  }

  addPlayer(code, playerId) {
    const room = this.getRoom(code);
    if (!room) return null;
    let slot = room.slots.find(s => s.id === playerId);
    if (!slot) {
      slot = { id: playerId, connected: true, disconnectedAt: null };
      room.slots.push(slot);
    } else {
      slot.connected = true;
      slot.disconnectedAt = null;
    }
    return slot;
  }

  disconnectPlayer(code, playerId, nowMs) {
    const room = this.getRoom(code);
    if (!room) return null;
    const slot = room.slots.find(s => s.id === playerId);
    if (slot) {
      slot.connected = false;
      slot.disconnectedAt = nowMs;
    }
    return slot;
  }

  sweep(nowMs) {
    const replies = [];
    const broadcasts = [];
    const sweptCodes = [];

    for (const [code, room] of this.rooms.entries()) {
      // Condition 1: Drop any room where every slot has been disconnected for longer than threshold
      const hasSlots = room.slots.length > 0;
      const allSlotsDisconnectedLongEnough = hasSlots && room.slots.every(slot => {
        return !slot.connected && slot.disconnectedAt !== null && (nowMs - slot.disconnectedAt > DISCONNECT_THRESHOLD);
      });

      // Condition 2: Drop any room whose createdAt is older than MAX_LIFETIME while still in lobby phase with fewer than 2 players
      const activePlayerCount = room.slots.filter(s => s.connected).length;
      const lobbyTooOldAndFewPlayers = room.phase === 'lobby' &&
        activePlayerCount < 2 &&
        (nowMs - room.createdAt > MAX_LIFETIME);

      if (allSlotsDisconnectedLongEnough || lobbyTooOldAndFewPlayers) {
        // Collect notifications for any remaining connected players in this room
        for (const slot of room.slots) {
          if (slot.connected) {
            replies.push({
              playerId: slot.id,
              message: { type: 'ROOM_CLOSED', reason: 'swept', code }
            });
          }
        }

        broadcasts.push({
          roomCode: code,
          message: { type: 'ROOM_CLOSED', reason: 'swept' }
        });

        // Delete the room
        this.rooms.delete(code);
        sweptCodes.push(code);
      }
    }

    return {
      replies,
      broadcasts,
      sweptCodes,
      sweptCount: sweptCodes.length
    };
  }
}

module.exports = {
  RoomManager,
  DISCONNECT_THRESHOLD,
  MAX_LIFETIME
};
