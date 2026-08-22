# Scorched Earth

## What It Is
A single-file HTML5 Canvas replica of the MS-DOS classic artillery game *Scorched Earth*. Built with pure vanilla ES6, single-player runs with no build step; multiplayer requires the Node relay. The entire gameplay engine, sound synthesis via Web Audio API, physics, terrain generator, and intermission shop are self-contained in a single lightweight file.

## How to Run
There are two ways to launch the game depending on your desired game mode:

### Single-Player / Local Static Mode
Run single-player matches locally with no dependencies or build steps:
1. **Directly in a Browser:** Open the `index.html` file directly from your local file system (`file://` protocol) in any modern web browser.
2. **Local Static HTTP Server:** Serve the directory over a plain static HTTP server:
   * Using Python: `python3 -m http.server 8000`
   * Using Node: `npx serve .`
   * Then navigate to `http://localhost:8000` (or the specified port) in your browser.

### Multiplayer Relay Mode
To play online multiplayer across browsers or devices:
1. **Local Relay:** Install dependencies and start the Node relay server:
   ```bash
   npm ci
   npm start
   ```
   This starts `server.js` listening on `http://0.0.0.0:8080` by default, serving `index.html` and providing the WebSocket endpoint on that same port.
2. **Hosted Instance:** Point your web browser to a deployed relay instance.

## Controls
The active human player can control their tank using the following key bindings:

| Key | Action |
| --- | --- |
| **Arrow Left** | Rotate turret to the left (increases angle). Adjusts by **1°** (or **5°** with **Shift** held). |
| **Arrow Right** | Rotate turret to the right (decreases angle). Adjusts by **1°** (or **5°** with **Shift** held). |
| **Arrow Up** | Increase velocity/power. Adjusts by **5** units (or **25** units with **Shift** held, up to 1000). |
| **Arrow Down** | Decrease velocity/power. Adjusts by **5** units (or **25** units with **Shift** held, down to 0). |
| **Space** / **Spacebar** | Fire the active weapon. |
| **\[** / **\]** / **Tab** | Cycle through available weapons in your inventory (**\[** cycles backward, **\]** and **Tab** cycle forward). |
| **M** | Toggle mute for all synthesised game sounds. |

## Setup Options
Before starting a game, you can customise the match settings in the setup screen:
* **Players:** 2 to 4 players can participate in a game.
* **Player Types (AI Opponents):** Each player slot can be configured as a **Human** player or one of four AI profiles:
  * **Human:** Controlled manually via keyboard.
  * **Moron:** Shoots randomly without targeting.
  * **Shooter:** Targets opponents but doesn't adjust for mistakes.
  * **Poolshark:** Attempts to use wall bounces to hit targets. The bank shot is only computed under the **rubber** wall mode; in every other mode it aims directly.
  * **Cyborg:** Implements error-correcting telemetry feedback to calibrate subsequent shots with deadly precision.
* **Rounds (1-20):** Select the number of rounds for the match (defaults to 5).
* **Starting Cash:** Choose the starting capital allocated to each player (defaults to $10,000).
* **Wall Type:**
  * **Off (None):** No wall at all — a projectile that leaves the left or right edge is removed and the turn ends.
  * **Rubber (Bouncing):** Projectiles bounce off the left and right borders of the screen.
  * **Wrap (Screen wrap):** Projectiles wrapping around from one side of the screen to the other.
  * **Concrete (Solid):** Projectiles bounce off the left and right borders **and off the top of the screen** — the ceiling bounce is the only difference from rubber.
* **Retro Tank Colors:** Choose from 8 retro CGA/EGA-inspired colors: Magenta, Cyan, Red, Green, Yellow, Blue, Orange, and White.
* **Weapons Availability:** Toggle between **All Weapons** (full shop arsenal available) or **Basic Only** (restricting weapon types to basic missiles).

## Arsenal
Players can purchase weapons and defensive equipment in the intermission shop between rounds.

### Weapons
| Weapon | Cost ($) | Pack Size | Blast Radius | Max Damage | Type / Kind | Description |
| --- | --- | --- | --- | --- | --- | --- |
| **Baby Missile** | 0 | 1 | 30 | 60 | Explosive | Unlimited free ammo. Good for basic pocket damage. |
| **Missile** | 500 | 5 | 40 | 80 | Explosive | Standard heavy munition pack. |
| **Baby Nuke** | 2,000 | 1 | 60 | 120 | Explosive | Medium tactical nuclear weapon. |
| **Nuke** | 5,000 | 1 | 100 | 200 | Explosive | High-yield nuclear warhead with massive blast radius. |
| **Meganuke** | 10,000 | 1 | 150 | 300 | Explosive | The ultimate destructive force. Obliterates massive terrain. |
| **MIRV** | 3,000 | 2 | 25 | 50 | Multi | Splits into 5 separate sub-projectiles at the apex of flight. |
| **Death's Head** | 6,000 | 1 | 35 | 70 | Multi | Giant cluster payload splitting into sub-munitions at apex. |
| **Cluster Bomb** | 2,000 | 3 | 20 | 40 | Pattern | Explodes into a shower of pattern bombs on terrain contact. |
| **Funky Bomb** | 3,000 | 2 | 25 | 50 | Pattern | Advanced scatter bomb variant. |
| **Baby Roller** | 1,000 | 5 | 20 | 40 | Pattern | Small roller projectile rolling along the terrain slope before exploding. |
| **Roller** | 2,000 | 3 | 30 | 60 | Pattern | Standard terrain-hugging rolling explosive. |
| **Heavy Roller** | 4,000 | 2 | 45 | 90 | Pattern | Heavyweight rolling bomb capable of climbing slopes and major damage. |
| **Napalm** | 1,500 | 3 | 15 | 5 | Liquid | Liquid fire cascade burning away terrain and shielding. |
| **Hot Napalm** | 3,000 | 2 | 20 | 10 | Liquid | High-intensity chemical liquid fire. |
| **Liquid Dirt** | 1,000 | 4 | 15 | 0 | Liquid | Pours liquid terrain downward from the impact point. |
| **Dirt Bomb** | 1,500 | 3 | 30 | 0 | Utility | Creates a dome of solid dirt terrain around the impact site. |
| **Dirt Detonator** | 1,000 | 5 | 0 | 50 | Utility | Detonates nearby dirt structures, clearing terrain and dealing direct damage. |
| **Sandstorm** | 2,000 | 3 | 0 | 0 | Utility | Releases a massive cascade of sand terrain to bury opponents. |
| **Tracer** | 100 | 10 | 0 | 0 | Utility | Non-destructive projectile leaving a flight path trace to aid manual aiming. |

### Defensive & Utility Items
| Item | Cost ($) | Pack Size | Strength | Category | Description |
| --- | --- | --- | --- | --- | --- |
| **Shield** | 1,000 | 1 | 100 | Shield | Standard forcefield protecting against initial damage. |
| **Heavy Shield** | 2,500 | 1 | 200 | Shield | Heavy duty forcefield offering robust protection. |
| **Mag Deflector** | 4,000 | 1 | 150 | Shield | Magnetic field that *deflects* an incoming shell instead of absorbing it (costs the shield 50 strength per bounce). |
| **Heavy Mag Deflector** | 6,000 | 1 | 250 | Shield | Heavy-duty deflector field. |
| **Super Magno Shield** | 8,000 | 1 | 400 | Shield | Top-tier deflector field. |
| **Force Shield** | 10,000 | 1 | 500 | Shield | The strongest absorbing shield in the game; does not deflect. |
| **Battery** | 500 | 2 | - | Battery | Recharges a raised shield by +50 (up to that shield's strength) if one is up and below its cap; otherwise restores +30 HP, capped at 100. |
| **Parachute** | 500 | 3 | - | Parachute | Prevents fall/drop damage when terrain collapses underneath your tank. |
| **Guidance Computer** | 2,000 | 1 | - | Utility | Assists in highlighting predicted projectile paths. |
| **Auto Defense** | 3,000 | 1 | - | Utility | Automatically deploys a replacement shield if a current shield collapses during a turn. |
| **Fuel** | 400 | 100 | - | Utility | Drive the tank left/right; 1 unit per pixel travelled. |
| **Teleport** | 2,000 | 1 | - | Utility | Jump to a random safe spot on the map (server-minted destination online, so every client agrees). |
| **Contact Trigger** | 800 | 5 | - | Trigger | Your next shot detonates on first contact, overriding roll / dig / tunnel / hop behaviour. |
| **Proximity Fuse** | 1,500 | 3 | - | Trigger | Your next shot detonates within 34px of an enemy hull — an air burst that ignores near-misses. |

A tank raises the strongest shield it owns at the start of its turn. Shields are shown as an arc
over the hull; deflectors draw thicker than absorbers.

## Economy
The game features a fully simulated round-by-round financial economy to encourage tactical shop purchases:
* **Damage Earnings:** Earn **$1** cash for every **1 HP** of damage dealt to opponents during a round.
* **Kill Bonus:** Earn **$500** cash for every tank destroyed.
* **Survival Bonus:** Surviving tanks receive a round-end survival bonus equal to **$100 * [Current Round Number]**.
* **Intermission Shop:** Spend accumulated cash during the intermission shopping phases between rounds to restock your inventory with advanced weaponry, shields, battery upgrades, and parachutes.

## Tests
A robust headless smoke test suite is included in the project to verify core systems, AI calculations, wind-velocity vectors, physics simulation, shop transactions, and deterministic PRNG seeds.

To execute the test suite locally, run the same command CI does:
```bash
node --test tests/
```

On Windows shells that rewrite the trailing path separator, point Node at the file instead:
```bash
node --test tests/smoke.test.js
```

The CI workflow is configured via GitHub Actions (`.github/workflows/ci.yml`) to automatically run the 34-test smoke suite on every push and pull request.

## Live Demo
_(pending deploy)_
