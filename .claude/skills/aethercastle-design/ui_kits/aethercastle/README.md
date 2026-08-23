# Æthercastle — game UI kit

A click-through recreation of the product's five surfaces, composed from this design system's components. Open `index.html`; the pill nav at the bottom jumps between screens.

| Screen | File | Source of truth |
| --- | --- | --- |
| Landing / matchmaking | `LandingScreen.jsx` | engine `#landing-view` — create private/public siege, join by 4-letter code, public room browser |
| Lobby | `LobbyScreen.jsx` | engine `#lobby-view` — share code, four seats, host-only rules (rounds, cash, wall, arsenal) |
| Battle | `BattleScreen.jsx` | engine `#hud` + canvas render — HUD strip, turn banner, terrain, tanks, roster, kill feed, aim bay |
| Aether Forge (intermission shop) | `ArmoryScreen.jsx` | engine `renderShop` + `WEAPONS`/`ITEMS` tables |
| Standings | `ArmoryScreen.jsx` → `StandingsScreen` | engine final match summary |

`data.jsx` holds the fake roster, arsenal and room list — stats are the engine's real values, renamed into Æthercastle's fiction (Baby Missile → Steam Mortar, Meganuke → Aether-Nuke, and so on).

Notes on fidelity:
- Terrain is a clipped silhouette using the biome ramps, standing in for the engine's per-column canvas heightmap.
- Tanks reproduce the engine's drawing recipe (hull rect, dome arc, stroked barrel) in the player's identity colour, plus a shield arc when a shield is up.
- Ordnance art is `IconTile` placeholders — see the Iconography section of the root readme.
