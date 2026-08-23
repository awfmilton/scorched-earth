repo: awfmilton/scorched-earth
branch: main

## Last sync
date: 2026-08-22T20:14:43Z

### Updated in this project
- Built the Æthercastle design system from the engine's information architecture (HUD field order, lobby, shop, standings).
- Imported the full weapon/item catalogue (costs, pack sizes, blast radii, damage) as the armory data model.
- Mapped the four seeded biomes to terrain colour ramps in `tokens/colors.css`.
- Kept a reference copy of the single-file engine at `reference/scorched-earth-index.html`.

## Screen map
| Project surface | Built from |
| --- | --- |
| `ui_kits/aethercastle/LandingScreen.jsx` | `index.html` (`#landing-view`: create private/public, join code, public room list) |
| `ui_kits/aethercastle/LobbyScreen.jsx` | `index.html` (`#lobby-view`, `#multiplayer-slots`, `#host-settings`), `lib/room-code.js` |
| `ui_kits/aethercastle/BattleScreen.jsx` | `index.html` (`#hud` span order, canvas terrain/tank drawing, `lib/terrain.js`) |
| `ui_kits/aethercastle/ArmoryScreen.jsx` | `index.html` (`renderShop`, `WEAPONS` + `ITEMS` tables), `README.md` arsenal/economy tables |
| `ui_kits/aethercastle/ArmoryScreen.jsx` (StandingsScreen) | `index.html` (final match summary) |
| `tokens/colors.css` (biome ramps) | `index.html` `Terrain.draw` sky/ground gradients |
