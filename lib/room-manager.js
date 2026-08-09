/**
 * RoomManager manages multi-player room states, player connections, and turn transitions.
 */
class RoomManager {
  constructor(options = {}) {
    this.slots = options.slots || []; // Array of slot objects: { connectionId, connected: true, alive: true }
    this.phase = options.phase || 'lobby'; // e.g. 'lobby', 'playing', 'paused'
    this.hostSlot = options.hostSlot !== undefined ? options.hostSlot : null;
    this.activeSlot = options.activeSlot !== undefined ? options.activeSlot : null;
    this.awaitingResolution = options.awaitingResolution !== undefined ? options.awaitingResolution : false;
    this.pausedAt = options.pausedAt || null;
    this.broadcasts = [];
  }

  /**
   * Register a custom broadcast handler or log broadcasts in local history.
   */
  broadcast(type, payload) {
    const msg = { type, payload };
    this.broadcasts.push(msg);
    if (typeof this.onBroadcast === 'function') {
      this.onBroadcast(type, payload);
    }
  }

  /**
   * disconnect(connectionId):
   *
   * Mark the player's slot connected = false. Do not delete the slot — the tank stays on the battlefield
   * and the slot must remain reclaimable later.
   * Broadcast PLAYER_LEFT { slot } plus a refreshed ROOM_STATE so other clients can grey the player out.
   * When the dropped player held activeSlot, clear awaitingResolution and advance the turn immediately with a TURN_SYNC broadcast.
   * When the dropped player held hostSlot, transfer the host role to the lowest connected slot so a lobby is never left unstartable.
   * While the room is still in lobby phase, removing the slot outright is acceptable; document whichever behaviour you implement in a comment.
   */
  disconnect(connectionId) {
    const slotIdx = this.slots.findIndex(s => s.connectionId === connectionId);
    if (slotIdx === -1) return;

    const slot = this.slots[slotIdx];

    // Helper to check if a specific slot is the active slot (can be index, slot object, or connectionId)
    const isActive = this.activeSlot === slot ||
                     (typeof this.activeSlot === 'number' && this.slots[this.activeSlot] === slot) ||
                     (slot && this.activeSlot === slot.connectionId);

    // Helper to check if a specific slot is the host slot (can be index, slot object, or connectionId)
    const isHost = this.hostSlot === slot ||
                   (typeof this.hostSlot === 'number' && this.slots[this.hostSlot] === slot) ||
                   (slot && this.hostSlot === slot.connectionId);

    // LOBBY PHASE SPECIAL BEHAVIOR:
    // If the room is still in lobby phase, removing the slot outright is acceptable.
    // Documented behavior: we remove the slot from the slots array completely during 'lobby' phase.
    if (this.phase === 'lobby') {
      this.slots.splice(slotIdx, 1);

      // Adjust numeric indices for hostSlot and activeSlot to account for the spliced array
      if (typeof this.hostSlot === 'number') {
        if (isHost) {
          // If the host was removed, transfer the host role
          const nextHostIdx = this.slots.findIndex(s => s.connected);
          this.hostSlot = nextHostIdx !== -1 ? nextHostIdx : null;
        } else if (slotIdx < this.hostSlot) {
          this.hostSlot--;
        }
      } else if (isHost) {
        // hostSlot is a slot object or connectionId reference
        const nextHostIdx = this.slots.findIndex(s => s.connected);
        if (nextHostIdx !== -1) {
          this.hostSlot = typeof this.hostSlot === 'string' ? this.slots[nextHostIdx].connectionId : this.slots[nextHostIdx];
        } else {
          this.hostSlot = null;
        }
      }

      if (typeof this.activeSlot === 'number') {
        if (isActive) {
          this.activeSlot = null;
        } else if (slotIdx < this.activeSlot) {
          this.activeSlot--;
        }
      } else if (isActive) {
        this.activeSlot = null;
      }

      // Broadcast PLAYER_LEFT { slot } and refreshed ROOM_STATE
      this.broadcast('PLAYER_LEFT', { slot });
      this.broadcast('ROOM_STATE', { slots: this.slots });
      return;
    }

    // PLAYING / PAUSED PHASES:
    // Mark the player's slot connected = false. Do not delete the slot.
    slot.connected = false;

    // Broadcast PLAYER_LEFT { slot } plus a refreshed ROOM_STATE so other clients can grey the player out.
    this.broadcast('PLAYER_LEFT', { slot });
    this.broadcast('ROOM_STATE', { slots: this.slots });

    // When the dropped player held hostSlot, transfer the host role to the lowest connected slot.
    if (isHost) {
      const nextHostIdx = this.slots.findIndex(s => s.connected);
      if (nextHostIdx !== -1) {
        if (typeof this.hostSlot === 'number') {
          this.hostSlot = nextHostIdx;
        } else if (typeof this.hostSlot === 'string') {
          this.hostSlot = this.slots[nextHostIdx].connectionId;
        } else {
          this.hostSlot = this.slots[nextHostIdx];
        }
      } else {
        this.hostSlot = null;
      }
    }

    // When the dropped player held activeSlot, clear awaitingResolution and advance the turn immediately with a TURN_SYNC broadcast.
    if (isActive) {
      this.awaitingResolution = false;
      this.nextTurn();
      this.broadcast('TURN_SYNC', { activeSlot: this.activeSlot });
    }
  }

  /**
   * nextTurn() — skip slots that are disconnected or dead. Guard the scan so it cannot spin:
   * when a full pass finds no connected, alive player, park the room (phase = 'paused', stamp pausedAt, stop advancing) rather than looping forever.
   */
  nextTurn() {
    if (!this.slots || this.slots.length === 0) return;

    // Find the current index in slots array
    let currentIdx = -1;
    if (typeof this.activeSlot === 'number') {
      currentIdx = this.activeSlot;
    } else {
      currentIdx = this.slots.indexOf(this.activeSlot);
      if (currentIdx === -1 && this.activeSlot) {
        currentIdx = this.slots.findIndex(s => s.connectionId === this.activeSlot);
      }
    }

    let found = false;
    for (let i = 0; i < this.slots.length; i++) {
      const checkIdx = (currentIdx + 1 + i) % this.slots.length;
      const slot = this.slots[checkIdx];
      if (slot.connected && slot.alive) {
        found = true;
        if (typeof this.activeSlot === 'number') {
          this.activeSlot = checkIdx;
        } else if (typeof this.activeSlot === 'string') {
          this.activeSlot = slot.connectionId;
        } else {
          this.activeSlot = slot;
        }
        break;
      }
    }

    if (!found) {
      // Park the room: set phase to 'paused', record timestamp, and do not advance.
      this.phase = 'paused';
      this.pausedAt = Date.now();
    }
  }
}

module.exports = RoomManager;
