# Æthercastle Sprite Kit — handoff package

Everything needed to replace the placeholder Aethercastle canvas art in
`awfmilton/scorched-earth`.

## Contents

| File | Purpose |
| --- | --- |
| `PROMPT.md` | **Start here.** The full implementation prompt for a Claude (Opus) session running in the repo — exact call sites, hard constraints, acceptance checklist. |
| `ac-common.js` | Shared pixel-art helpers (hash, dither, masonry, crenels, bevel plate, glow). Load first. |
| `ac-sky.js` | Banded night sky, starfield, aether moon, far ruined-keep ridge. |
| `ac-terrain.js` | Strata + crust + per-biome fringe (grass/scree/sand/heather) + aether bloom. |
| `ac-chassis.js` | All six vehicle hulls. Muzzle contract kept: barrel anchored at (x, y−6), length 12. |
| `ac-structures.js` | All ten structures + rubble + `drawFoundationAC` (masonry footings on slopes). |
| `ac-weapons.js` | Per-family projectile sprites, latticed shields, tiered explosions (nuke mushroom cloud, void implosion, napalm, riot, dirt). |

## How to use

1. Copy this `gfx/` folder into the repo root.
2. Open a Claude session in the repo and paste the whole of `PROMPT.md`.
3. Review with `Sprite Kit Preview.html` (optional; carries its own mock
   theme, not part of the game).

## Ground rules baked into the kit

- Draw-only and deterministic — no `Math.random`, no clocks; texture hashes
  from world coordinates, motion keys off replicated values (`tank.x`).
- Classic mode untouched; every swap gates on the Aethercastle path.
- Structure footprints and chassis hull sizes unchanged (wire contracts).
- Colours come from the live THEMES/BIOME_RAMPS tables; derived shades via
  `ACG.mix` only — no invented palette.
