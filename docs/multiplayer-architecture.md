# Multiplayer Architecture for Scorched Earth

## Overview

This document outlines the architectural decisions for the multiplayer networking model in Scorched Earth.

As a turn-based artillery game (similar to *Worms* or the original *Scorched Earth*), the game's requirements differ significantly from real-time action games (like shooters or RTS games). This document compares the realistic networking options and details our chosen approach.

## 1. State Management: Authoritative Server vs. Deterministic Lockstep

### Authoritative Server
- **Pros:** Impossible for clients to cheat (e.g., by faking shot results). The server runs the physics engine and dictates all positions.
- **Cons:** Extremely high server load, as the server must simulate 2D pixel-perfect terrain destruction and physics for every concurrent game. Writing a headless server-side physics engine that perfectly matches the client's canvas or WebGL physics is difficult and resource-intensive.

### Deterministic Lockstep (Our Choice)
- **Concept:** The server acts as a lightweight message relay. All clients are given the same initial state (e.g., a shared random seed for terrain generation, wind, and player positions). When a player takes an action (fires a weapon), only the *inputs* (angle, power, weapon type) are sent to the server. The server broadcasts these inputs to all clients. Each client simulates the physics locally. Because the physics are deterministic, all clients arrive at the exact same outcome (terrain destruction, damage, eliminations).
- **Why it fits:** Turn-based artillery games naturally have low input frequency (one player acts at a time) and discrete turns. This makes lockstep incredibly efficient. The server only needs to pass small JSON payloads (FIRE_SYNC, TURN_SYNC) rather than simulating complex terrain destruction. 
- **Tradeoffs (What we gave up):** We sacrifice strict cheat resistance. A modified client *could* theoretically send a spoofed RESOLVE_SHOT message or manipulate their local memory. However, for a casual web-based game played primarily among friends via share codes, keeping the server lightweight and cheap to host is vastly more important than military-grade anti-cheat. 

## 2. Transport Protocol: WebRTC vs. WebSockets

### WebRTC Data Channels (Peer-to-Peer)
- **Pros:** Lowest possible latency. True peer-to-peer (P2P) means minimal server bandwidth.
- **Cons:** Requires a signaling server anyway to exchange SDP offers/answers. NAT traversal (STUN/TURN) is notoriously flaky; corporate firewalls or strict NATs often block P2P connections, requiring costly TURN server relays as fallbacks.

### WebSockets with Relay (Our Choice)
- **Concept:** All clients connect to a central Node.js server via secure WebSockets (WSS). The server relays messages between clients in the same "room".
- **Why it fits:** Turn-based games do not need the sub-50ms latency of WebRTC. A WebSocket delay of 100-200ms is imperceptible when firing an artillery shell, as the animation plays out locally in real-time once the FIRE_SYNC message is received. WebSockets easily bypass NAT and firewalls since they operate over standard HTTP/HTTPS ports (80/443).
- **Tradeoffs:** The server must route all game traffic. But because lockstep payloads are tiny (a few bytes per turn), a single Node.js instance can handle thousands of concurrent rooms easily.

## 3. Room & Session Brokering

Players will join games using a **Room Brokering** model. 
- The server maintains a dictionary of active rooms, keyed by a short, 4-character **Share Code** (e.g., A4X9).
- **Joining:** A player can easily share this code via text/voice. When a friend enters the code, the server routes them into the WebSocket room. 
- **Browsing:** We also allow players to query the server for open/public rooms if they don't have a code.
- **Reconnection:** To handle disconnects gracefully, the server hands out a playerToken when a user joins a room. If their WebSocket drops, they can send a REJOIN { code, playerToken } message to claim their previous slot and receive the latest game state.

## Conclusion

The chosen architecture is a **Deterministic Lockstep over a WebSocket Relay**. 
This approach perfectly leverages the discrete, turn-based nature of artillery games. It avoids the immense overhead of simulating destructible terrain on the backend, bypasses NAT traversal nightmares, and makes it incredibly easy to scale the server to thousands of concurrent players.
