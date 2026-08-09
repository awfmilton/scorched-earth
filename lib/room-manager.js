class RoomManager {
  constructor() {
    this.rooms = new Map(); // roomCode -> { roomCode, players: [ { connectionId, playerName } ] }
    this.players = new Map(); // connectionId -> { roomCode, playerName }
  }

  createRoom(connectionId, msg) {
    const playerName = msg.playerName || `Player_${connectionId.toString().substring(0, 4)}`;
    // Generate simple uppercase 4-character code
    let roomCode;
    do {
      roomCode = Math.random().toString(36).substring(2, 6).toUpperCase();
    } while (this.rooms.has(roomCode));

    const room = {
      roomCode,
      players: [{ connectionId, playerName }]
    };

    this.rooms.set(roomCode, room);
    this.players.set(connectionId, { roomCode, playerName });

    return {
      replies: [
        { type: 'ROOM_CREATED', roomCode }
      ],
      broadcasts: []
    };
  }

  joinRoom(connectionId, msg) {
    const roomCode = (msg.roomCode || '').toUpperCase();
    const room = this.rooms.get(roomCode);
    if (!room) {
      return {
        replies: [
          { type: 'ERROR', message: 'Room not found' }
        ],
        broadcasts: []
      };
    }

    const playerName = msg.playerName || `Player_${connectionId.toString().substring(0, 4)}`;
    room.players.push({ connectionId, playerName });
    this.players.set(connectionId, { roomCode, playerName });

    // Build the room state message
    const roomStateMsg = {
      type: 'ROOM_STATE',
      roomCode,
      players: room.players.map(p => ({ playerName: p.playerName }))
    };

    // Broadcast to all players in the room
    const broadcasts = room.players.map(p => ({
      connectionId: p.connectionId,
      message: roomStateMsg
    }));

    return {
      replies: [],
      broadcasts
    };
  }

  disconnect(connectionId) {
    const playerData = this.players.get(connectionId);
    if (!playerData) {
      return { broadcasts: [] };
    }

    const { roomCode } = playerData;
    this.players.delete(connectionId);

    const room = this.rooms.get(roomCode);
    if (room) {
      room.players = room.players.filter(p => p.connectionId !== connectionId);
      if (room.players.length === 0) {
        this.rooms.delete(roomCode);
        return { broadcasts: [] };
      } else {
        // Send updated state to remaining players
        const roomStateMsg = {
          type: 'ROOM_STATE',
          roomCode,
          players: room.players.map(p => ({ playerName: p.playerName }))
        };
        const broadcasts = room.players.map(p => ({
          connectionId: p.connectionId,
          message: roomStateMsg
        }));
        return { broadcasts };
      }
    }

    return { broadcasts: [] };
  }

  sweep(now) {
    // Sweep stale rooms or empty rooms (if any exist without players)
    const broadcasts = [];
    for (const [roomCode, room] of this.rooms.entries()) {
      if (!room.players || room.players.length === 0) {
        this.rooms.delete(roomCode);
      }
    }
    return { broadcasts };
  }
}

module.exports = { RoomManager };
