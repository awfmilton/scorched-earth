# Crash Diagnostics Design — Scorched Earth

Status: DESIGN ONLY. No code in this document is implemented yet.

## 0. The organizing principle

This game is deterministic lockstep (`docs/multiplayer-architecture.md`). The server mints a
32-bit seed and wind per round (`lib/room-manager.js:149-151`, `947-948`), broadcasts them in
`ROUND_START`, and after that broadcasts only *inputs*: `FIRE_SYNC` with a server-computed
launch vector (`lib/room-manager.js:674-695`), `MOVE_SYNC` (`:826-836`), `TELEPORT_SYNC`
(`:853-863`), `TURN_SYNC` (`:1093-1103`), `ROUND_END` (`:1054-1067`). Every client re-simulates
locally from those frames — `NetClient.dispatchTable` routes them into
`applyFireSync`/`applyTurnSync`/`applyMoveSync`/`applyTeleportSync`/`applyRoundEnd`
(`index.html:949-962`), and all randomness flows from two seeded mulberry32 streams,
`terrainRNG` and `gameplayRNG` (`index.html:583-608`), reseeded per round in `newRound()`
(`index.html:1826-1833`).

Therefore: **the round seed plus the ordered S2C frame log since ROUND_START is a complete,
byte-exact reproduction of the match state at any point in the round.** The
identical-input-replay property is already proven by `tests/game-determinism.test.js:79-141`
and `tests/browser-lockstep.test.js:133-152`.

Everything below is built around that. A crash report is not a log file; it is a **replayable
input trace plus a checkpoint digest to verify the replay landed on the same world**. Support
does not read prose; support runs the trace through the existing harness
(`tests/helpers/browser-harness.js`) and watches the crash happen in Node.

Non-negotiable constraints honoured throughout:

- Vanilla JS. Zero new runtime dependencies (justified in §4.6).
- The capture path must never perturb the simulation: no draws from `terrainRNG`/`gameplayRNG`,
  no work inside `stepPhysics()` (`index.html:2861`) or the fixed-tick loop
  (`index.html:4346-4366`). All hooks fire per *network frame* (a handful per turn) or on a
  5-second UI timer.
- Must degrade to a no-op in the Node harness: the vm context in
  `tests/helpers/browser-harness.js:102-129` has no `fetch`, no `navigator.sendBeacon`, and
  stubs `setInterval` to `() => 1` (`:108`) — the design leans on exactly those absences.
- Diagnostics must never take down the transport: every hook added inside
  `NetClient.onmessage` is wrapped in its own `try {} catch {}`.

---

## 1. Client-side capture

### 1.1 The input journal (the heart of the report)

A new inline module `CrashReporter` (an IIFE section in `index.html` beside `NetClient`,
mirroring how the page inlines protocol literals — see the comment at `index.html:942-943`)
keeps a per-round journal:

- **Hook point:** one guarded call inserted in `NetClient.onmessage` immediately after the
  parse succeeds and before the handler dispatch try (`index.html:1101`):
  `try { CrashReporter.journal(msg); } catch (e) {}`. This is the single point every S2C
  frame already passes through.
- **Recorded types:** `ROUND_START` (resets the journal and snapshots
  `rosterAtRoundStart`, §1.4), `FIRE_SYNC`, `MOVE_SYNC`, `TELEPORT_SYNC`, `TURN_SYNC`,
  `PLAYER_LEFT`, `ROUND_END`. Not recorded: `ROOM_STATE`, `ROOM_LIST`, `ERROR` — they are
  lobby/UI traffic, not simulation inputs (the dispatch table at `index.html:949-962` draws
  the same line).
- **Entry shape:** `{ n, t, msg }` where `n` is the sequence number, `t` is
  `Date.now() - roundStartAt` (diagnostic only — replay is message-*order*-driven, §6, so
  timing is never load-bearing), and `msg` is the frame verbatim.
- **Bound:** 1024 frames per round. Frames are ~60–200 B each (`MOVE_SYNC` is the small,
  high-volume one: one frame per keypress, `index.html:1923`). Overflow drops the *oldest*
  frame except frame 0 (`ROUND_START`) and sets `truncated: true` — truncation is last-resort
  because it forfeits replay identity (§1.6 ordering).
- The journal also updates `lastFrameAt` — the progress marker the soft-hang watchdog reads
  (§1.5). Cost: one array push per network message. Nothing per tick.

### 1.2 Capture triggers

Three hard-error triggers plus one soft one:

1. **`window.onerror`** — registered via `window.addEventListener('error', ...)` in the
   `DOMContentLoaded` block (`index.html:4484`), where the page already wires `net.onError`
   (`index.html:4651-4653`). Kind: `uncaught`.
2. **`unhandledrejection`** — `window.addEventListener('unhandledrejection', ...)`, same
   place. Kind: `unhandledrejection`. (The codebase is promise-light — only the clipboard
   path — but the hook is two lines.)
3. **`HANDLER_ERROR`** — the natural hook the task anticipates. `NetClient.handleError`
   (`index.html:1178-1188`) receives `{ type: 'HANDLER_ERROR', messageType, error }` from the
   dispatch catch at `index.html:1101-1109`. Add one guarded line in `handleError`:
   `if (errObj.type === 'HANDLER_ERROR' && typeof CrashReporter !== 'undefined') CrashReporter.captureNetError(errObj);`
   This covers both NetClient instances the page creates (the lobby-level `net` at
   `index.html:4389` and any Game-constructed one at `index.html:1408`). `messageType` becomes
   `error.messageType` in the report — "message type in flight". This is exactly the class of
   defect that shipped the silent shop failure (`tests/net-handler-errors.test.js:1-8`); with
   this design that incident would have produced a replayable report naming `ROUND_END` as the
   frame in flight.
4. **Soft-hang watchdog** — §1.5, because the worst multiplayer failure here is not a throw
   but a wedged turn.

Rate limiting: at most 3 reports per page load, minimum 30 s apart, deduped on
`kind + error.message`. A render-loop error would otherwise fire 60×/s.

### 1.3 Snapshot contents — exact schema

`CrashReporter.capture(kind, error, extra)` reads `globalThis.SCORCHED.gameInstance` (the
same route `NetClient.toGame` uses, `index.html:968-975`) and builds:

```jsonc
{
  "v": 1,                                  // schema version, integer
  "id": "SE-7Q4M-K2XR",                    // §3.2
  "kind": "uncaught",                      // "uncaught" | "unhandledrejection" |
                                           // "handler-error" | "soft-hang" |
                                           // "server-exception" | "server-fatal"
  "at": 1787654321000,                     // Date.now() at capture, integer ms
  "build": {
    "commit": "b32c9a7",                   // string; "unknown" if /api/version unreachable (§1.7)
    "ua": "Mozilla/5.0 ..."                // navigator.userAgent, string, <= 256 chars
  },
  "error": {                               // null for kind:"soft-hang"
    "name": "TypeError",                   // string
    "message": "x is not a function",      // string, <= 512 chars
    "stack": "TypeError: ...\n  at ...",   // string, <= 8192 chars (first truncation, §1.6)
    "messageType": "FIRE_SYNC"             // string | null — S2C type in flight (HANDLER_ERROR only)
  },
  "hang": {                                // null unless kind:"soft-hang"
    "reason": "wedged-turn",               // "wedged-turn" | "stuck-shell" | "no-round-start"
    "waitedMs": 45000                      // integer
  },
  "net": { "state": "live" },              // NetClient.state: "live"|"connecting"|"reconnecting"|"lost"
  "match": {
    "roomCode": "A4X9",                    // string(4) | null (local play)
    "mode": "online",                      // game.mode: "online" | "local"
    "seed": 2896731911,                    // uint32 — game.seed, the round seed (index.html:1827)
    "wind": -42.5,                         // float — game.wind
    "round": 3,                            // game.currentRound, integer >= 1
    "totalRounds": 5,                      // game.rounds
    "turnNumber": 7,                       // game.turnNumber (set by applyTurnSync, index.html:1623)
    "activeSlot": 2,                       // game.roster[game.activePlayerIdx].slot
    "mySlot": 0,                           // game.mySlot
    "turnOrder": [0, 1, 2],                // game.turnOrder
    "config": { "rounds": 5, "startingCash": 10000, "wallType": "off",
                "weaponsAvailability": "all", "gravity": 150, "...": "..." }
                                           // the ROUND_START config verbatim — replay needs it
  },
  "sim": {
    "ticks": 51234,                        // game.roundState.ticks (index.html:1398, ++ at :2863)
    "terrainHash": "9f3ab2c1",             // §1.4 — FNV-1a-32 hex over terrain.heights bytes
    "rngDraws": { "terrain": 5219, "gameplay": 87 },  // §1.4 — draw counters
    "activeShotId": 12,                    // game.activeShotId | null
    "reportedShotId": 12,                  // game.reportedShotId | null (RESOLVE_SHOT sent?)
    "projectile": {                        // game.projectile | null (index.html:1602-1611)
      "x": 512.25, "y": 133.9,             // floats
      "vx": 424.26, "vy": -424.26,         // the server-minted doubles, verbatim
      "weapon": "MIRV",                    // weapon id string
      "trigger": "proximity",              // "proximity" | "contact" | null — armed trigger
      "shotId": 12
    },
    "roster": [                            // one entry per game.roster tank (index.html:2190-2215)
      {
        "slot": 0,                         // integer — the identity key everywhere
        "hp": 64, "x": 412.03, "y": 233.5, // number
        "angle": 78, "power": 640,         // the aim state (weapon id/power/angle live here)
        "cash": 12400,
        "selectedWeapon": "MIRV",
        "shield": { "type": "Heavy Shield", "hp": 80 },   // | null
        "connected": true,
        "inventory": { "Baby Missile": -1, "MIRV": 2, "Fuel": 63, "Proximity Fuse": 1 }
                                           // counts; Infinity serialized as -1 (JSON has no
                                           // Infinity; Baby Missile is Infinity at index.html:2207)
      }
    ],
    "rosterAtRoundStart": [ /* same tank shape, snapshotted when ROUND_START was journaled */ ]
  },
  "inputLog": {
    "truncated": false,
    "frames": [
      { "n": 0, "t": 0,    "msg": { "type": "ROUND_START", "seed": 2896731911, "wind": -42.5,
                                    "turnOrder": [0,1,2], "tanks": [ { "slot": 0 } ],
                                    "config": { "...": "..." }, "round": 3, "totalRounds": 5 } },
      { "n": 1, "t": 210,  "msg": { "type": "TURN_SYNC", "activeSlot": 2, "turnNumber": 1 } },
      { "n": 2, "t": 9421, "msg": { "type": "FIRE_SYNC", "shotId": 1, "shooterSlot": 2,
                                    "angle": 45, "power": 600, "vx": 424.26, "vy": -424.26,
                                    "wind": -42.5, "weapon": "Missile" } }
      // ... every MOVE_SYNC / TELEPORT_SYNC / TURN_SYNC / PLAYER_LEFT since ROUND_START
    ]
  },
  "server": null                           // attached server-side on receipt, §2.2 — never client-set
}
```

Field-by-field justification of the requested items:

- **weapon + power + angle + trigger** — three homes, all captured: the per-tank aim state
  (`angle`, `power`, `selectedWeapon` on the roster, `index.html:2204-2208`), the in-flight
  `sim.projectile` (including `trigger`, armed deterministically from inventory via
  `TRIGGER_PRIORITY`, `index.html:543-550`, attached at `index.html:1610`), and the
  authoritative record in each journaled `FIRE_SYNC` frame.
- **Full roster with HP/cash/inventory** — as above. There is no `chassis` concept anywhere in
  the codebase (the tank object is fully enumerated at `index.html:2194-2214`); the nearest
  analogues, `shield` and `type`, are captured. The design deliberately names only fields that
  exist.
- **Names are NOT in the roster snapshot** — replaced by slot numbers (privacy, §5). Replay
  keys everything on `slot` exactly as the game does (`index.html:2198-2201`), so names are
  dead weight. `ROUND_START.tanks` entries in the journal are likewise reduced to
  `{ slot }` at journal time.

### 1.4 Terrain digest and RNG draw counters (two tiny simulation-adjacent additions)

**Terrain digest.** `terrain.heights` is a `Float32Array(1200)` (`index.html:1231`,
`CONST.WORLD_W` at `index.html:437`) — 4.8 KB raw, 10–15 KB as JSON. It is *derivable* from
`seed + inputs`, which the report already carries; shipping it would be redundant bytes. What
the report needs is a **checkpoint to verify a replay reproduced the same world**, and for
that a 32-bit digest is sufficient (false-match odds 2⁻³²). The harness already has exactly
this function: `hashTerrain` — FNV-1a over the heights bytes
(`tests/helpers/browser-harness.js:142-148`). Hoist a byte-identical copy into `index.html`
as `terrainDigest(game)`, export it on `SCORCHED` (`index.html:4844-4860`), and add a unit
test asserting the inline copy and the harness copy agree on a generated terrain. It runs
only at capture time — never per tick.

**RNG draw counters.** Add a `draws` counter to `createRngStream` (`index.html:583-602`):
`next()` increments a closure counter; `drawCount()` reads it; `seed(n)` resets it. The state
transition itself is untouched — observation only, zero effect on the sequence. Value: the
single deadliest lockstep bug class is *draw-count misalignment* (a weapon consuming a
different number of `gameplayRNG` values on two clients — the exact failure
`tests/game-determinism.test.js:118-133` guards). `sim.rngDraws` in two crash reports from
the same round makes that diagnosis a subtraction. The byte-level determinism tests
(`game-determinism`, `browser-lockstep`, `multiplayer`) will catch any slip in this change
instantly.

`visualRNG` (`index.html:613-625`) is not counted — it is render-only by design.

### 1.5 Soft-hang detection (the game can freeze without throwing)

A `TurnWatchdog` armed only in the `DOMContentLoaded` block (`index.html:4484`), via
`setInterval(check, 5000)`. In the harness `setInterval` is a stub
(`tests/helpers/browser-harness.js:108`) so the watchdog is dead in every test by
construction; it is additionally gated on `!game.headless && game.mode === 'online'`.

Trip conditions (each fires at most once per match per reason; thresholds are constants on
the watchdog object so tests can shrink them):

| reason | condition | anchored on |
|---|---|---|
| `wedged-turn` | `!game.roundOver && game.activeShotId != null && game.projectile === null && game.reportedShotId === game.activeShotId` continuously for 45 s | `RESOLVE_SHOT` was sent (`index.html:1808`) but no `TURN_SYNC` came back — `applyTurnSync` is the only thing that clears `activeShotId` online (`index.html:1621-1626`). This is the known wedge class. |
| `stuck-shell` | same `projectile.shotId` alive for 120 s of wall time | `MAX_FLIGHT_TICKS` is 1800 ticks = 30 s of sim (`index.html:441`, enforced at `:2953`); 4× margin. |
| `no-round-start` | `game.roundOver && !game.matchOver && game.shopDoneSentForRound === game.currentRound` for 180 s | this client left the shop (`index.html:1702-1706`) and the next `ROUND_START` never arrived. Note: merely waiting in the "WAITING FOR OTHER PLAYERS" state (`index.html:1708-1726`) while *others* shop is legitimate and is covered by the same rule — the server starts the round only when every connected player reports in (`lib/room-manager.js:924-934`), and 180 s of that is genuinely a stall worth a report. |

A tripped watchdog produces a normal report with `kind: "soft-hang"`, `error: null` and the
`hang` block filled. Progress state (`lastFrameAt`) is maintained by the journal hook, so the
watchdog itself only reads fields — no per-tick cost, no allocation in the hot loop.

The false-positive it must NOT have: "opponent is thinking." An idle remote turn produces no
frames legitimately, which is why the conditions key on *in-flight shot state* and *own
shop-done state*, never on "no traffic for N seconds."

### 1.6 Size budget and truncation order

Serialized report cap: **128 KiB** (server rejects raw bodies over 256 KiB with 413, §4.2).
Typical report: 4-tank roster ≈ 1.5 KB; a long round with heavy driving ≈ 40–80 KB of
`MOVE_SYNC` frames; everything else < 4 KB.

Truncation order, cheapest-information-loss first:

1. `error.stack` → 8192 chars (always applied). Stacks beyond the first ~30 frames are noise.
2. `build.ua` → 256 chars, `error.message` → 512 chars (always applied).
3. `inputLog.frames` → drop oldest first, **never frame 0** (`ROUND_START`), set
   `truncated: true`. This is last because it is the only step that breaks bit-exact replay —
   a truncated log downgrades the report from "replayable" to "diagnostic". If budgets ever
   bite in practice, the recorded compaction option is coalescing consecutive same-slot
   same-dir `MOVE_SYNC` frames (safe: `driveTank(tank, dir, 3)` ≡ three `steps:1` calls —
   pure terrain arithmetic, no RNG, `index.html:1872-1898`), at the cost of frame-count parity
   with the server journal. Not in v1.

### 1.7 Build/commit id

There is no build step — `index.html` is served raw with `no-cache`
(`server.js:88-90`). Stamping the HTML would break the tests that read it verbatim
(`tests/helpers/browser-harness.js:16-17`, `tests/game-determinism.test.js:8-10`). Instead:

- Server: `GET /api/version` → `{ commit, startedAt }`. Commit resolved once at boot:
  `process.env.COMMIT`, else `execSync('git rev-parse --short HEAD')` in a try/catch (the
  deploy re-clones the repo, so `.git` exists), else `"unknown"`.
- Client: one `fetch('/api/version')` in the `DOMContentLoaded` block, cached in a module
  variable; reports carry `"unknown"` until/unless it resolves. Guarded on
  `typeof fetch === 'function'` — absent in the harness vm context
  (`tests/helpers/browser-harness.js:104-122`), so a no-op in tests.
- The server additionally stamps its own commit on every stored report (`server.commit`,
  §2.2), which is the authoritative one.

---

## 2. Server-side capture

### 2.1 Per-room broadcast journal

The server already sees every input it relays, so it can reconstruct any client's round from
its own record. Add a bounded journal to each room:

- `room.journal = { seed, round, startedAt, lastFrameAt, frames: [] }`, reset where
  `ROUND_START` broadcasts are built: `RoomManager.start()` (`lib/room-manager.js:447-466`)
  and `maybeBeginNextRound()` (`:980-998`). Also seeded by `rejoin()`'s ROUND_START replay
  (`:1197-1214`) — no reset there, the round is already in progress.
- A small helper `journalFrame(room, msg)` called at each broadcast mint site — they are few
  and all have `room` in scope: `fire()` (`:679-695`), `move()` (`:826-836`), `teleport()`
  (`:853-863`), `nextTurn()` for both `TURN_SYNC` (`:1093-1103`) and `ROUND_END`
  (`:1054-1067`), `disconnectFromRoom()`'s `PLAYER_LEFT` (`:548-554`), and the two
  ROUND_START sites. `ROUND_START` is journaled once in canonical form with `yourSlot`
  removed (it is per-recipient, `:459`; replay supplies its own slot).
- Bound: 1024 frames per round (matches the client cap), oldest-dropped-except-frame-0.
  Memory: ≤ ~150 KB per room worst case, and room count is already bounded by `sweep()`
  (`lib/room-manager.js:1238-1292`) plus the per-connection cap (`:30, :143-145`).

### 2.2 Correlating a client crash report

The client report carries `match.roomCode + match.round + match.seed`. On receipt (§4.2) the
store handler:

1. Looks up `roomManager.rooms.get(normalize(roomCode))`.
2. If the room exists and `room.journal.seed === report.match.seed` (same round — seeds are
   re-minted every round, `lib/room-manager.js:947`), attaches:

```jsonc
"server": {
  "commit": "b32c9a7",
  "receivedAt": 1787654322000,
  "journalMatch": true,                    // false if room gone/seed mismatch
  "room": {                                // the turn-authority view, nothing secret
    "phase": "playing", "turnNumber": 7, "activeSlot": 2,
    "awaitingResolution": true, "currentRound": 3, "totalRounds": 5
  },
  "frames": [ /* room.journal.frames — the server's own copy of the input log */ ]
}
```

3. If the room was already swept, `journalMatch: false` and the client's own log stands
   alone — still fully replayable, since client and server logs are copies of the same
   broadcasts.

The server section deliberately mirrors `serializeRoom`'s discipline
(`lib/room-manager.js:53-58`): no `playerToken`, no `connectionId`, ever. Divergence between
`server.frames` and `inputLog.frames` is itself a first-class diagnostic: it means frames
were lost or reordered client-side, which no amount of client-only logging could prove.

### 2.3 The server's own exceptions

Two layers:

1. **Per-message:** the catch in `createRoomManagerHandlers.onMessage` (`server.js:284-291`)
   currently converts every throw into an S2C `ERROR` frame. Deliberate rule rejections carry
   a protocol code via `roomError()` (`lib/room-manager.js:38-42`); an *unexpected* exception
   has no `.code`. In that branch only, additionally write a report: `kind:
   "server-exception"`, the stack, the offending C2S `msg` **with any `playerToken` field
   redacted** (REJOIN carries one, `lib/protocol.js:78-81`), and the room journal if the
   connection resolves to a room. The ERROR reply to the client is unchanged.
2. **Process-level:** in the `require.main` block (`server.js:304-344`), register
   `process.on('uncaughtException')` / `process.on('unhandledRejection')` handlers that
   `fs.writeFileSync` a minimal `kind: "server-fatal"` report (stack, commit, room count)
   and then exit non-zero. Synchronous write because the process is dying.

### 2.4 Server-side stall detection

Piggyback the existing sweep timer (`server.js:315-333`): during each sweep pass, any room
with `phase === 'playing' && awaitingResolution && now - room.journal.lastFrameAt > 120000`
gets one `kind: "soft-hang"` server report (marked on the room so it fires once per stall).
This catches the wedge class where *no* client reports — e.g. every client sent its
`RESOLVE_SHOT` but the server's `resolveShot` guards silently dropped them
(`lib/room-manager.js:724-734` returns empty on slot/shotId mismatch — a silent no-op by
design, and precisely the sort of thing this journal exists to catch in the field).

---

## 3. Player-facing surface

### 3.1 The panel

No silent freezes. `CrashReporter.showPanel(report)` builds a fixed-position DOM overlay
(`#crash-panel`, created imperatively with `document.createElement` /
`document.body.appendChild` — no markup edit, and the harness DOM stand-in supports both,
`tests/helpers/browser-harness.js:31-66, 81`). DOM, not canvas: the render loop
(`index.html:4346-4366`) may be the thing that died, and a DOM overlay outlives it.

Exact copy, in the game's voice — terse second-person quartermaster, no emoji, no
exclamation marks:

Hard crash (`uncaught` / `unhandledrejection` / `handler-error`):

```
THE MACHINE SEIZED

Your side of the match hit a fault. The state that led here is
recorded under this tag.

    SE-7Q4M-K2XR

[ COPY TAG ]   [ COPY FULL RECORD ]   [ RELOAD AND REJOIN ]

Quote the tag when you report it. Reload and the room will offer
your seat back if the match still stands.
```

Soft hang (`soft-hang`):

```
THE TURN HAS STALLED

The server has not moved the match on. The stall is recorded
under this tag.

    SE-7Q4M-K2XR

[ COPY TAG ]   [ RELOAD AND REJOIN ]

Reload first. Quote the tag if it stalls again.
```

- COPY TAG / COPY FULL RECORD: `navigator.clipboard.writeText`, falling back to a hidden
  textarea + `document.execCommand('copy')` (both already stubbed by the harness,
  `tests/helpers/browser-harness.js:82, 117`). COPY FULL RECORD copies the whole report JSON —
  the escape hatch when the upload failed (§4.5): a player can paste a fully replayable
  report into a Discord DM or GitHub issue.
- RELOAD AND REJOIN: `location.reload()`. The rejoin path already exists —
  `scorched_session` in sessionStorage (`index.html:4694-4695`) drives a `REJOIN` on the next
  connect (`index.html:1060-1063`), and the server replays `ROUND_START` + live `TURN_SYNC`
  to the rejoiner (`lib/room-manager.js:1197-1227`).

### 3.2 Crash ID format

`SE-XXXX-XXXX`: the literal prefix `SE-`, then 8 characters of Crockford base32
(`0123456789ABCDEFGHJKMNPQRSTVWXYZ` — no I, L, O, U, so it survives being read over the
phone), grouped 4-4.

Derivation: 40 bits taken from a 64-bit content hash of the canonical report JSON (the report
minus the `id` and `server` fields). The hash is two independent 32-bit FNV-1a passes — one
over the bytes, one over the bytes with each byte XOR `0x5C` — concatenated. FNV-1a is chosen
because the codebase already uses it (`tests/helpers/browser-harness.js:142-148`), it is six
lines of dependency-free synchronous JS, and `crypto.subtle` is unavailable in non-secure
contexts (the dev server is plain `http`, `server.js:25`). 40 bits ≈ 10¹² ids: at any
plausible report volume, birthday collisions are negligible, and the store disambiguates a
true collision by suffixing (`-2`) at write time (§4.3).

Content-derived (rather than random) so the client can mint and display the id even when the
upload fails, and the server independently derives the same id for the same bytes — no round
trip needed before the player sees their tag.

### 3.3 Degradation ladder

1. **Always first**: `console.error('[crash ' + id + ']', reportJson)` — before any DOM work,
   so the record exists even if rendering explodes.
2. Full panel (above).
3. If `document.body.appendChild` throws (DOM in ruins): `alert()` with the two-line text
   `"The machine seized. Quote this tag: SE-XXXX-XXXX"` (the harness stubs `alert`,
   `tests/helpers/browser-harness.js:120`).
4. In the Node harness / headless: none of the above runs beyond the `console.error`
   (`showPanel` returns immediately when `game.headless`, the same guard pattern
   `updateHUD` uses at `index.html:1973-1976`).

---

## 4. Transport, storage, retention, lookup

### 4.1 Why HTTP POST and not the WebSocket

Two hard reasons anchored in existing code:

- The WS relay refuses frames over `MAX_PAYLOAD_BYTES = 4096` before parsing
  (`server.js:9, 175-178`). A crash report is tens of KB. Raising that cap for everyone to
  accommodate crash traffic would loosen a deliberate abuse bound.
- The protocol validator rejects unknown C2S types (`lib/protocol.js:196-200`,
  `server.js:195-198`). Adding a `CRASH_REPORT` C2S type would grow the lockstep protocol
  surface for something that is not a game input.

The server is already an HTTP server (`server.js:25-111`); reports ride the port that exists.

### 4.2 Endpoint

`POST /api/crash-report`, routed at the top of the `createServer` request handler before the
405 rejection of non-GET/HEAD (`server.js:30-34`):

- Body: the report JSON. Raw-size cap 256 KiB → `413`. Content-Type must be JSON → `415`.
- Validation in a new `lib/crash-report.js`: shape-check against the §1.3 schema in the same
  hand-rolled validator style as `lib/protocol.js:51-174` (types, bounds, frame-type
  allowlist). Reject → `400`. Notably: `inputLog.frames[].msg.type` must be one of the seven
  journaled S2C types, and every frame is re-validated with the existing
  `protocol.validate()` — the store never persists a frame the protocol itself would not
  have produced.
- Rate limit: 10 reports/minute/IP in a small in-memory token bucket → `429`. The IP is used
  for the bucket only and is not written to the report (§5).
- On accept: derive/verify the id (§3.2), attach the `server` section (§2.2), write to disk,
  reply `200 { "id": "SE-XXXX-XXXX" }`.
- `GET /api/version` from §1.7 lands in the same routing block.

Client transport: `navigator.sendBeacon('/api/crash-report', blob)` when available (survives
an imminent reload), else `fetch(..., { method: 'POST', keepalive: true })`, else — no-op.
The harness vm context has neither (`tests/helpers/browser-harness.js:104-122`), which *is*
the required test-environment no-op, and the panel still renders locally with COPY FULL
RECORD as the manual path.

### 4.3 Storage format

- Directory: `crash-reports/` beside `server.js` (gitignored).
- One file per report: `crash-reports/<id>.json`, pretty-printed, written with flag `wx`
  (never overwrite). Same id + different content (true 40-bit collision) → suffix `-2`.
  Same id + same content (client retried) → drop silently.
- No database, no index: at this scale `fs.readdir` + mtime is the index. The filename IS
  the crash id.

### 4.4 Caps and retention

- Keep at most **500 files** and **64 MiB**; delete oldest-by-mtime beyond either.
- Retention **30 days**, enforced at boot and by an `unref`'d 6-hour interval in the
  `require.main` block (the 30 s sweep cadence at `server.js:13` is too hot for fs scans).
- Write-time enforcement too (cheap: prune only when a write happens), so a report flood
  cannot outrun the timer.

### 4.5 Lookup flow (what support actually types)

```
# player reads the tag off the panel, over voice if need be
node scripts/crash-lookup.mjs SE-7Q4M-K2XR
#   -> prints: file path, kind, capturedAt, commit, room/round/seed,
#      error name+message, frame count, terrainHash, journalMatch
#   -> --json dumps the full report to stdout

node scripts/replay-crash.mjs SE-7Q4M-K2XR      # §6 — watch it happen in Node
```

Both accept a bare id, `<id>.json`, or an absolute path — the path form is how a
COPY-FULL-RECORD paste from a player (saved to a file) enters the same pipeline when the
upload never reached the server.

### 4.6 Dependency statement

Zero new runtime dependencies. Everything uses node core (`http`, `fs`, `crypto`,
`child_process` for one boot-time `git rev-parse`) plus the existing `ws` (`package.json`).
Rejected: any hashing/id/schema library — the FNV/base32 code is ~20 lines and already has
in-repo precedent; a JSON-schema validator would be the largest dependency in the project to
validate one shape the repo already validates by hand everywhere else.

---

## 5. Privacy

Ground rule: **capture the simulation, not the person.** The simulation is fully described by
server-minted values and game inputs; nothing player-typed is needed to reproduce a crash.

Captured, with reasoning:

| Field | Why it is safe and needed |
|---|---|
| seed, wind, input frames | Server-minted numbers and game inputs (`lib/room-manager.js:149-151, 674-695`). No personal content is expressible in them — the protocol schemas (`lib/protocol.js:107-160`) admit only numbers and weapon-id strings from a fixed list. They are the reproduction. |
| slots, turnOrder, turnNumber | Small integers; the game's own identity system (`index.html:2198-2201`). |
| hp/cash/inventory/aim per tank | Game-state numbers required for round-N replay (§6) and for reading the crash context. |
| terrainHash, rngDraws, ticks | Derived integers; checkpoint and divergence diagnostics. |
| roomCode | 4 characters, expires when the room is swept; required for server-side correlation (§2.2). Knowing a code for a dead room grants nothing (`lib/room-manager.js:239-241` — non-lobby rooms are unjoinable). |
| error name/message/stack | The defect itself. The app is a single file served from its own origin, so stack URLs leak no third-party paths. |
| userAgent | First triage question for lockstep divergence is "which engine" — the sim exists because engine trig differs (`index.html:627-638`). Capped at 256 chars. |
| commit, timestamps | Which code produced the report. |

Deliberately NOT captured, with reasoning:

| Excluded | Why |
|---|---|
| Player names | Player-entered free text (up to 16 chars, `lib/protocol.js:61`) — the only free-text field in the whole protocol, and replay does not need it: everything keys on `slot`. Roster snapshots and journaled `ROUND_START.tanks` are stripped to slots at capture time. If a future need appears (support says "which one was Dave"), the answer is the room code + slot, resolved verbally. |
| Colours | Palette-constrained (`lib/room-manager.js:26, 343-352`) so technically harmless, but excluded to keep the rule crisp: nothing chosen by a player ships in a report unless replay requires it. Replay does not. |
| playerToken | A rejoin credential (`lib/room-manager.js:55-58`): pasting a report anywhere public must never hand over a seat. Redacted from captured C2S messages in server-exception reports too (§2.3). |
| IP addresses | The HTTP layer sees one for rate limiting (§4.2) and forgets it; it is never written into a report. The WS layer keys everything on a random UUID (`server.js:151`) already. |
| Chat text | There is no chat — no such message type exists (`lib/protocol.js:8-38`). Stated here so that if chat is ever added, it is excluded by default rather than swept in by a "log all frames" habit. |
| sessionStorage contents, URLs, query strings | Contain the session credential and nothing diagnostic. |

The player can read everything being sent: COPY FULL RECORD shows the exact bytes (§3.1).

---

## 6. Replay integration — a report becomes a failing test

### 6.1 The helper

New file `tests/helpers/crash-replay.js` (reusing the exported page `code` from
`tests/helpers/browser-harness.js:16-17, 204` and the vm pattern of
`tests/game-determinism.test.js:12-33`):

```js
/**
 * Re-simulates a crash report's round from seed + input log, in-process.
 *
 * @param {object} report          a parsed §1.3 crash report
 * @param {object} [opts]
 * @param {number} [opts.stopBeforeFrame]  replay up to (not including) frame n;
 *                                         default: all frames except a fatal one
 * @param {function} [opts.onFrame]        (n, msg, game) => void, called after each frame
 * @returns {{
 *   game: object,                 // the headless Game at the stop point
 *   checks: {
 *     terrainHash: string,        // digest at stop point
 *     terrainMatch: boolean,      // === report.sim.terrainHash
 *     roster: string,             // tanksOf()-style "slot:x:y:hp|..." digest
 *     rosterMatch: boolean,
 *     rngDraws: { terrain: number, gameplay: number },
 *     rngMatch: boolean
 *   },
 *   error: Error | null           // thrown when the fatal frame was applied, if any
 * }}
 */
function replayCrashReport(report, opts = {}) { ... }
```

Flow, step by step:

1. Evaluate `index.html`'s script in a bare vm context (no DOM, no sockets — exactly
   `evaluateIndexHtml`, `tests/game-determinism.test.js:12-33`).
2. `const game = new SCORCHED.Game({ headless: true })` (`index.html:1394` — headless mode
   creates no NetClient, no canvas).
3. **Round bring-up from frame 0** (`ROUND_START`), reproducing what the page does:
   - Round 1: build the config the page handler builds (`index.html:4746-4768`) —
     `players` from the frame's tanks (slot-keyed placeholders), `isMultiplayer: true`,
     `mySlot` from `report.match.mySlot`, seed/wind/turnOrder from the frame, `net` omitted
     (stays null; nothing sends) — and call `game.start(config)` (`index.html:2151`).
   - Round N > 1: the input log only covers the current round, and cash/inventory are the
     product of earlier rounds — which is why the report carries
     `sim.rosterAtRoundStart` (§1.3). Do what a rejoining client effectively does
     (`lib/room-manager.js:1197-1214` → `index.html:4741-4743`): `game.start()` for shape,
     overwrite each tank's `cash`/`inventory`/`hp` from `rosterAtRoundStart` (restoring
     `-1 → Infinity`), then `game.applyServerRoundStart(frame0.msg)`
     (`index.html:1732-1779`), which reseeds `gameplayRNG` and redraws positions exactly as
     live clients do.
4. **Apply frames 1..k in order** through the same method mapping as
   `NetClient.dispatchTable` (`index.html:949-962`): `FIRE_SYNC → game.applyFireSync(msg)`,
   `MOVE_SYNC → applyMoveSync`, `TELEPORT_SYNC → applyTeleportSync`,
   `TURN_SYNC → applyTurnSync`, `PLAYER_LEFT → applyPlayerLeft`,
   `ROUND_END → applyRoundEnd`. After each `FIRE_SYNC`, run
   `game.stepPhysics(CONST.TICK)` until `game.projectile === null` and no tank is falling,
   capped at `MAX_FLIGHT_TICKS + settle` — the identical loop the lockstep test uses
   (`tests/browser-lockstep.test.js:134-139`). Frame *timing* (`t`) is ignored: lockstep
   state depends on message order and tick count only, which is the whole reason the report
   replays at all.
5. At the stop point, compute `checks` (terrain digest via the same FNV; roster via the
   `tanksOf` string, `tests/helpers/browser-harness.js:150`; RNG draw counts) and compare
   against `report.sim`.
6. If the report is a `handler-error` and a fatal frame exists (the journaled frame whose
   type equals `error.messageType`, when it is the last one), apply it inside try/catch and
   return the caught error.

A `checks.*Match === true` result is the proof the replay landed on the crash world; from
there the developer steps frame-by-frame with `onFrame`, or attaches a debugger to a 100-line
Node script instead of a browser at a player's house.

### 6.2 The entry point

`scripts/replay-crash.mjs <id|file>`:

1. Resolve: bare id → `crash-reports/<id>.json`; otherwise treat as a path (this is how a
   player-pasted record enters, §4.5).
2. Run `replayCrashReport`.
3. Print a verdict:

```
report SE-7Q4M-K2XR  kind=handler-error  commit=b32c9a7  room=A4X9 round=3 seed=2896731911
frames replayed: 41/42
state reproduced:  terrain 9f3ab2c1 OK   roster OK   rngDraws OK
fault reproduced:  TypeError: shields is not defined
    at Game.applyRoundEnd (index.html:...)
```

Non-zero exit when state fails to reproduce — that outcome is itself a finding (engine
divergence or a stale report against changed sim code).

### 6.3 A report becomes a permanent regression test

- Directory `tests/crash-replays/` holds committed report JSONs, named
  `NNN-<crashid>-<slug>.json`.
- New `tests/crash-regressions.test.js` globs that directory and, for each report, asserts
  two things: (a) replay reaches the stop point with `terrainMatch && rosterMatch` — the
  determinism contract against the *recorded* world, forever; (b) applying the final frame
  does **not** throw — the fixed-bug contract.
- Workflow: support looks up the report (§4.5) → confirms with `replay-crash.mjs` → the fix
  PR copies the report into `tests/crash-replays/` — so the same PR that fixes the bug turns
  the crash into a suite-guarded impossibility, in the exact spirit of
  `tests/net-handler-errors.test.js` (a shipped bug frozen as a test) but generated from the
  field instead of written by hand.
- The test file tolerates an empty directory (0 reports = 0 subtests), so it lands in step 4
  of the sequencing before any report exists.

---

## 7. Implementation sequencing

Ordered cheapest-highest-value first. Every step must leave the full suite green
(`npm test` → `node --test --test-force-exit "tests/*.test.js"`, `package.json`).

| # | Step | Files touched | Notes / risk flags |
|---|---|---|---|
| 1 | `lib/crash-id.js`: FNV-64 content hash, Crockford base32, id mint/parse. Pure functions + unit test. | `lib/crash-id.js`, `tests/crash-id.test.js` | Zero game code touched. |
| 2 | Client observability: RNG `draws` counters in `createRngStream` (`index.html:583-602`); inline `terrainDigest` mirroring `hashTerrain`; journal + `rosterAtRoundStart` snapshot via one guarded call in `NetClient.onmessage` (`index.html:1101`); export `CrashReporter` on `SCORCHED` (`index.html:4844-4860`). | `index.html`, `tests/crash-capture.test.js` (harness-driven), 1-line harness test that inline digest === `hashTerrain` | **Determinism risk, managed:** counters observe, never draw; journal allocates per network frame, never per tick; the byte-identity suites (`game-determinism`, `browser-lockstep`, `multiplayer`) are the tripwire and must pass untouched. The journal call sits *before* the dispatch try and inside its own `try{}catch{}` — a diagnostics bug must neither kill the socket nor masquerade as `HANDLER_ERROR`. |
| 3 | Capture + panel: `capture()`, schema build, truncation, rate limit; hooks for `window.onerror`, `unhandledrejection` (DOMContentLoaded block, `index.html:4484`) and `HANDLER_ERROR` (in `handleError`, `index.html:1178-1188`); panel with the §3.1 copy. | `index.html`, extend `tests/net-handler-errors.test.js` (throwing handler ⇒ report object + panel text via the harness DOM) | Value ships here even with no server: tag + COPY FULL RECORD. Panel code follows the `updateHUD` headless guard (`index.html:1973-1976`). |
| 4 | Replay pipeline: `tests/helpers/crash-replay.js`, `scripts/replay-crash.mjs`, `tests/crash-regressions.test.js` (empty-dir tolerant), plus one self-test: drive a harness match (`setupMatch`, `tests/helpers/browser-harness.js:175-202`), force a capture, replay the captured report, assert digests match. | new files only | The self-test is the keystone: it proves capture→replay round-trips on the real wiring. No production code touched. |
| 5 | Server endpoint + store: `POST /api/crash-report`, `GET /api/version` in `createServer` (`server.js:25-111`); `lib/crash-report.js` (validation, frame re-validation via `protocol.validate`), `lib/crash-store.js` (write/prune/retention); `scripts/crash-lookup.mjs`. | `server.js`, `lib/crash-report.js`, `lib/crash-store.js`, `scripts/crash-lookup.mjs`, `tests/crash-endpoint.test.js` | Routing added *before* the 405 branch (`server.js:30-34`) — an existing-behaviour test (non-GET to other paths still 405s) guards the static server. Do NOT touch `MAX_PAYLOAD_BYTES` (`server.js:9`) or `lib/protocol.js`. |
| 6 | Server journal + correlation + server-exception capture: `journalFrame` at the broadcast sites (§2.1); attach `server` section in the store; no-`.code` branch in the handlers catch (`server.js:284-291`); process-level fatal hooks in `require.main` (`server.js:304-344`). | `lib/room-manager.js`, `server.js`, `tests/room-journal.test.js` | Test asserts the room journal equals what a harness client received — the correlation contract. Journal is append-only bookkeeping; no room-logic branch changes, so `turn-authority`, `rooms`, `rejoin`, `room-sweep` suites must pass untouched. |
| 7 | Soft-hang watchdogs: client `TurnWatchdog` (§1.5) with injectable thresholds; server stall check on the sweep pass (§2.4). | `index.html`, `server.js`, `tests/soft-hang.test.js` | Thresholds as options so tests use tiny values and drive `check()` directly — no fake-timer machinery, no flakiness. Harness `setInterval` stub (`browser-harness.js:108`) means the interval never runs in any existing test. |

Cross-cutting risks, called out once:

- **The suite (~250 tests) is the determinism tripwire.** Steps 2 and 6 are the only ones
  that touch simulation-adjacent code (`createRngStream`, `NetClient.onmessage`, RoomManager
  broadcast sites); both are pure-observation changes, and both land as isolated diffs so a
  red determinism test bisects to one commit.
- **No step edits `lib/protocol.js`** — the lockstep protocol surface is unchanged; crash
  traffic lives entirely on HTTP.
- **Nothing runs in `stepPhysics`/`update`/`loop`** (`index.html:2861, 3590, 4346`) — the
  hot path is byte-for-byte untouched.
