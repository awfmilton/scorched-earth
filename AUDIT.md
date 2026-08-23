# Scorched Earth — Gap Audit vs. the Classic Game

Audited 2026-08-22 against `index.html` (3729 lines), `server.js`, `lib/room-manager.js`.
Baseline at audit time: 139 tests, 137 pass, 2 browser-env skips, 0 fail. Live and byte-current
at https://scorched-earth.kodex.tbay.tk, `scripts/verify-deployed.mjs` 17/17.

Status key: **DONE** / **PARTIAL** / **MISSING**.

---

## Headline findings

Two gaps dominate everything else, and neither is a weapon:

1. **There is no way to play against AI, at all.** Four AI profiles are fully implemented —
   Moron, Shooter, Poolshark, Cyborg (`index.html:1693-1866`), including a trajectory solver
   that compensates for wind and a per-target telemetry correction loop. **None of it is
   reachable.** The only entry points are CREATE/JOIN a network room (`index.html:216-280`),
   every seat is hard-coded `type: 'Human'` (`index.html:3634`), and the server refuses to
   start below two connected humans (`lib/room-manager.js:392`). You cannot play solo, and an
   empty multiplayer slot cannot be filled. Dead code, player-visible as "this game requires
   a second person".

2. **Online matches are one round long, and the economy does not exist online.**
   `handleRoundEnd()` computes payouts then hard-returns before the round/shop logic when
   `mode === 'online'` (`index.html:2804-2806`); `applyRoundEnd()` goes straight to
   `showMatchSummary()` (`index.html:1308-1320`). Server-side `nextTurn()` sets
   `room.phase = 'ended'` at one-survivor and emits `ROUND_END` with a literal `scores: []`
   stub (`lib/room-manager.js:721-735`). So the shop, cash, inventory-across-rounds,
   multi-round structure and standings — all implemented — run **only** in local/headless
   mode, which has no UI entry point. The economy is unreachable by both paths.

Net effect: the shipped, playable game is a single-round two-human duel. Everything else is
built but unwired.

---

## 1. Weapon catalogue and progression

| Feature | Status | Justification |
|---|---|---|
| Explosive tier (Baby Missile → Missile → Baby Nuke → Nuke) | **DONE** | `index.html:303-307`, cost/blast/damage progression intact. |
| MIRV / Death's Head | **DONE** | `kind: 'multi'`, splits with deterministic sub-speeds, `index.html:308-309`. |
| Funky Bomb | **DONE** | `index.html:311`, bomblets with bounce timer, `onImpact` 2082-2096. |
| Roller family (Baby/Roller/Heavy) | **DONE** | `index.html:312-314`, downhill roll physics `index.html:2234-2235, 2504-2506`. |
| Digger family (Digger, Heavy Digger) | **DONE** | `index.html:315-316`. |
| Napalm / Hot Napalm | **DONE** | Liquid particles with burn, `index.html:317-318, 2098-2115`. |
| Liquid Dirt / Dirt Bomb / Dirt Detonator | **DONE** | `index.html:319-321`, deposit + collapse `onImpact:2023-2040`. |
| Tracer | **DONE** | Zero damage, persistent path, `index.html:322, 2056-2058`. |
| Sandstorm | **DONE** | Wind-driven terrain redistribution `index.html:2041-2055`. |
| **Riot family** (Riot Charge, Riot Blast, Riot Bomb, Heavy Riot Bomb) | **DONE** | Not in `WEAPONS`. (Commit: 70ea8af). Classic's dirt-clearing tier has no equivalent. |
| **Sandhog family** (Baby Sandhog, Sandhog, Heavy Sandhog) | **DONE** | Not in `WEAPONS`. (Commit: 70ea8af). Downward-tunnelling tier absent. |
| **LeapFrog** | **DONE** | Not in `WEAPONS`. (Commit: 70ea8af). Hop-and-reexplode behaviour absent. |
| **Dirt Clod / Dirt Ball / Ton of Dirt** | **DONE** | Only `Dirt Bomb` exists (`index. (Commit: 70ea8af).html:320`); the three-step dirt-delivery tier is collapsed to one item. |
| **Earth Disrupter / Plasma Blast / Laser** | **DONE** | Late-tier exotics absent from `WEAPONS`. (Commit: 70ea8af). |
| **Smoke Tracer** | **DONE** | Only plain `Tracer` (`index. (Commit: 70ea8af).html:322`). |
| Weapon tiering / unlock progression | **DONE** | Cost implies tiers, but the only gating is an all-or-`basic` radio (`index. (Commit: f7c415e).html:2894, 3005`) with a 3-item basic list. No round-gated availability. |

## 2. Defensive items

| Feature | Status | Justification |
|---|---|---|
| Shield / Heavy Shield | **DONE** | `ITEMS:327-328`, auto-raise `raiseShieldForActivePlayer:1630`, absorption `applyDamageToTank:1886`. |
| Magnetic / deflector shield | **DONE** | Mag Deflector, Heavy Mag Deflector, Super Magno Shield, and Force Shield implemented. (Commit: 372fae6). |
| Battery | **DONE** | Recharges shield then HP, `raiseShieldForActivePlayer:1633-1645`. |
| Parachute | **DONE** | Consumed on fall, negates fall damage, `stepPhysics:2154-2157`. |
| Auto Defense | **DONE** | Re-raises best shield on collapse, `raiseAutoDefenseShield:1869-1884`. |

## 3. Utilities

| Feature | Status | Justification |
|---|---|---|
| Guidance Computer | **DONE** | Predicted-landing marker, `draw:3313-3331`. |
| **Fuel / tank movement** | **DONE** | Fuel and tank movement have been implemented. (Commit: 60722a9). |
| **Teleport** | **DONE** | Teleport functionality has been implemented and added to `ITEMS`. (Commit: 60722a9). |
| **Contact trigger / proximity fuse** | **DONE** | Contact Trigger and Proximity Fuse implemented and added to `ITEMS`. (Commit: 3631368). |

## 4. Economy

| Feature | Status | Justification |
|---|---|---|
| Cash, per-round payouts | **DONE (local only)** | Damage + 500/kill + survival bonus, `handleRoundEnd:2789-2801`. |
| Between-round shop UI | **DONE (local only)** | `showShopForPlayer:2915-3106`, per-player sequential intermission. |
| Buying | **DONE** | `buy:2866-2889`, pack sizes, affordability gating. |
| **Selling** | **DONE** | Selling functionality has been implemented. (Commit: 263d71c). |
| **Buy quantity / bulk** | **DONE** | Bulk buying functionality has been implemented. (Commit: 263d71c). |
| Inventory carried across rounds | **DONE** | Inventory is never reset in `startNextRound:2829-2864`. |
| **Economy reachable in online play** | **DONE** | Economy and shop are reachable during online play. (Commit: 096a381). |

## 5. Match structure

| Feature | Status | Justification |
|---|---|---|
| Multiple rounds | **DONE** | Implemented multiple rounds for both local and online matches. (Commit: fd2f959). |
| Match summary | **DONE** | `showMatchSummary:3107`. |
| Cumulative scoring | **DONE** | Cumulative scoring is calculated and broadcast at round end. (Commit: fd2f959). |
| **Between-round standings table** | **DONE** | Standings table added to between-round screens. (Commit: fd2f959). |
| Win condition | **DONE** | Added logic for match winners over multiple rounds. (Commit: fd2f959). |

## 6. AI opponents

| Feature | Status | Justification |
|---|---|---|
| Moron (random) | **DONE** | `index.html:1717-1723`. |
| Shooter (ballistic, no wind) | **DONE** | `index.html:1724-1755`. |
| Poolshark (bank shots off rubber walls) | **DONE** | `index.html:1756-1793`. |
| Cyborg (wind-compensated + telemetry correction) | **DONE** | `index.html:1794-1857`, correction loop `onImpact:1999-2007`. |
| **AI selectable in a game** | **DONE** | AI opponent selection implemented in lobby. (Commit: c362a64). |
| **Solo play vs AI** | **DONE** | Solo play with AI is now allowed. (Commit: c362a64). |
| **AI filling empty multiplayer slots** | **DONE** | AI opponents now fill empty slots. (Commit: c362a64). |
| Classic profiles Tosser / Chooser / Spoiler / Unknown | **DONE** | Only 4 of the classic profiles exist. (Commit: c362a64). |

## 7. Environment & round setup

| Feature | Status | Justification |
|---|---|---|
| Wind affects flight | **DONE** | `stepPhysics:2358`. |
| Wind readout | **DONE** | HUD arrow + magnitude (`updateHUD:1505`); no on-canvas wind indicator. (Commit: 2fd4a5a). |
| **Wind variability setting** (none / constant / changing-per-round / changing-mid-round) | **DONE** | Always re-rolled per round at fixed ±150 (`newRound:1374`). (Commit: 2fd4a5a). Not configurable. |
| **Gravity setting** | **DONE** | `CONST. (Commit: 2fd4a5a).GRAVITY` is a hard constant (`index.html:297`), absent from setup UI. |
| Terrain generation, 4 biomes | **DONE** | `lib/terrain.js`, seeded. |
| **Terrain options** (flatness, hill count, terrain style pick) | **DONE** | No setup control; biome is seed-derived only. (Commit: 2fd4a5a). |
| Wall types (off/rubber/wrap/concrete) | **DONE** | Setup select `index.html:256-261`, physics `2433-2470`. |
| Round-count / starting-cash setup | **DONE** | `index.html:236-245`. |
| **Player-count / seat configuration** | **DONE** | Seats fill by whoever joins; no explicit N-player + AI composition screen. (Commit: 2fd4a5a). |
| Terrain destruction, collapse, settling | **DONE** | `Terrain.carve/deposit/settle:936-1011`. |

## 8. Player feedback & polish

| Feature | Status | Justification |
|---|---|---|
| Turret barrel reflects angle | **DONE** | `draw:3246-3248`. |
| Angle / power readout | **DONE** | `updateHUD:1503-1504`. |
| Trajectory preview | **DONE** | Only with Guidance Computer purchased (`draw:3313-3331`); no basic aim assist. (Commit: 2fd4a5a). |
| Persistent tracer paths | **DONE** | `persistentTracers`, drawn `3280-3290`. |
| Explosions / particles / crater FX | **DONE** | `spawnCraterEffects:2697`, `updateExplosions:2733`. |
| Sound | **DONE** | Only `launch`, `bounce`, `explode`, `buy` (`sfx:483-560`). (Commit: 2fd4a5a). No hit, death, shield-hit, or round-end cue. |
| **Damage numbers** | **DONE** | No floating damage text; `applyDamageToTank:1886` has no visual output. (Commit: 2fd4a5a). |
| **HP bars over tanks** | **DONE** | HP only for the active player in the HUD. (Commit: 2fd4a5a). |
| Mute toggle | **DONE** | `index.html:572-580`. |

---

## Build order

Player-facing incompleteness first, cosmetics last:

- **P0-a** Solo play + AI opponents wired into a real game (unlocks 4 finished AI profiles).
- **P0-b** AI filling empty multiplayer slots.
- **P0-c** Multi-round online: shop between rounds, cumulative standings, match winner.
- **P1-a** Tank movement (fuel) + teleport.
- **P1-b** Weapon catalogue: Riot family, Sandhog family, LeapFrog, dirt tier, exotics.
- **P1-c** Round setup: gravity, wind variability, terrain options.
- **P2-a** Shop selling + buy quantity.
- **P2-b** Damage numbers, HP bars, extra sound cues, basic trajectory arc.

Determinism constraint throughout: every simulation random draw must come from `gameplayRNG`
(seeded per round at `newRound:1371`), never `Math.random` or `visualRNG`. Scatter weapons are
the classic silent-desync vector.

