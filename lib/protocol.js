class Protocol {
  validate(msg) {
    if (!msg || typeof msg !== 'object') {
      throw new Error('Message must be an object');
    }
    if (!msg.type || typeof msg.type !== 'string') {
      throw new Error('Message type must be a string');
    }
    const validTypes = ['CREATE_ROOM', 'JOIN_ROOM'];
    if (!validTypes.includes(msg.type)) {
      throw new Error(`Invalid message type: ${msg.type}`);
    }
    if (msg.type === 'JOIN_ROOM') {
      if (!msg.roomCode || typeof msg.roomCode !== 'string') {
        throw new Error('roomCode is required for JOIN_ROOM');
      }
    }
    return true;
  }
}

module.exports = new Protocol();
