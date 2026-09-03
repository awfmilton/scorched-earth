# Æthercastle graphics update — implementation prompt

Paste this whole file into a local Claude (Opus) session running in the
`awfmilton/scorched-earth` repo, with the `gfx/` folder already copied into
the repo root.

---

## Mission

Replace the placeholder Aethercastle canvas art in `index.html` with the
sprite kit in `gfx/`. The kit contains one file per item class, each a
drop-in renderer with the same call shape the engine already uses:

| File | Exposes (browser global) | Replaces |
| --- | --- | --- |
| `gfx/ac-common.js` | `ACG` (helpers) | — shared by all others |
| `gfx/ac-sky.js` | `ACSky.drawSkyAC(ctx, ramp, W, H)` | the sky-gradient half of `Terrain.draw()` |
| `gfx/ac-terrain.js` | `ACTerrain.drawTerrainAC(ctx, heights, ramp, W, H, biome)` | the ground half of `Terrain.draw()` |
| `gfx/ac-chassis.js` | `ACChassis.drawTankAC(ctx, tank, chassis, isActive, theme)` | the Aethercastle branch of `drawTank()` |
| `gfx/ac-structures.js` | `ACStructures.drawStructureAC(ctx, s, spec, theme, ownerColour)`, `drawRubbleAC(ctx, left, groundY, w, h, theme)` and `drawFoundationAC(ctx, s, spec, theme, heights, worldH)` | `drawStructure()` / `drawRubble()`, plus a NEW masonry-footing pass |
| `gfx/ac-weapons.js` | `ACWeapons.drawProjectileAC(ctx, p, theme)`, `drawShieldAC(ctx, tank, colour, deflects, theme)`, `drawExplosionAC(ctx, x, y, r, frac, theme)` | the projectile dot, shield arc and explosion passes in `Game.draw()` |

`Sprite Kit Preview.html` (optional to copy) renders every sprite for visual
review; it carries its own mock THEME and is not part of the game.

## Hard constraints — read before touching anything

1. **Classic mode is a replica and must not change by one pixel.** Every
   swap below applies ONLY on the Aethercastle path. `THEMES.classic`,
   the classic branch of `drawTank()`, and classic's `Terrain.draw()` call
   log are protected by `tests/render-classic-parity.test.js` and
   `tests/fixtures/classic-frame.golden.txt`. Gate every new call on the
   mode (`theme === THEMES.classic`, or `ramp.glow === undefined` for
   terrain — classic ramps carry no `glow`).
2. **Muzzle contract.** The barrel is anchored at `(x, y - 6)` and is 12
   long; shells spawn there. `ac-chassis.js` already honours this — do not
   "fix" its geometry.
3. **Footprints are wire contracts.** `STRUCTURES` w/h and `CHASSIS`
   hullW/hullH stay exactly as they are; all new art lives inside those
   boxes.
4. **Render purity.** The kit is draw-only and deterministic (texture is
   hashed from world coordinates; motion keys off replicated values like
   `tank.x`, never a clock or `Math.random`). Keep it that way — do not
   add time-based animation parameters when wiring it in.
   `tests/render-purity.test.js` and `tests/render-mutation-guard.test.js`
   must keep passing.
5. **Simulation untouched.** No file under `gfx/` may be imported by
   `lib/` or `server.js`. This is a visualisation-layer change only; no
   wire message, constant, or physics value changes.

## Integration steps

### 0. Load the kit

In `index.html`, next to the existing `<script src="lib/terrain.js">` /
`lib/structures.js` tags, add (order matters — common first):

```html
<script src="gfx/ac-common.js"></script>
<script src="gfx/ac-sky.js"></script>
<script src="gfx/ac-terrain.js"></script>
<script src="gfx/ac-chassis.js"></script>
<script src="gfx/ac-structures.js"></script>
<script src="gfx/ac-weapons.js"></script>
```

If the project prefers staying single-file, inline the six IIFEs into
`index.html` in the same order instead; they are self-contained.

### 1. Terrain + sky (`Terrain.draw`, ~line 2040)

Inside `Terrain.draw(ctx, ramp)`, branch on `r.glow` (Aethercastle ramps
have it, classic ramps do not):

```js
draw(ctx, ramp) {
  if (!ctx) return;
  const r = ramp || biomeRampFor(activeMode, this.biome);
  if (r.glow && window.ACSky) {
    ACSky.drawSkyAC(ctx, r, CONST.WORLD_W, CONST.WORLD_H);
    ACTerrain.drawTerrainAC(ctx, this.heights, r, CONST.WORLD_W, CONST.WORLD_H, this.biome);
    return;
  }
  /* ...existing body, unchanged, for classic... */
}
```

### 2. Tanks (`drawTank`, ~line 2349)

Keep the classic branch verbatim. Replace everything AFTER the
`theme === THEMES.classic` early-return with:

```js
ACChassis.drawTankAC(ctx, tank, chassis, isActive, theme);
```

Delete the old Aethercastle hull/turret/marker code that follows (the kit
draws dome, barrel and active marker itself).

### 3. Structures (`drawStructure` ~2157, `drawRubble` ~2132)

Structures exist only in Aethercastle, so these swap wholesale:

```js
function drawRubble(ctx, left, groundY, w, h, theme) {
  ACStructures.drawRubbleAC(ctx, left, groundY, w, h, theme);
}
function drawStructure(ctx, s, spec, theme, ownerColour) {
  ACStructures.drawStructureAC(ctx, s, spec, theme, ownerColour);
}
```

(Or update the call sites in `Game.drawStructures` directly and delete the
old bodies.)

### 3b. Foundations (NEW — buildings on slopes)

`layoutStructures` seats a building on the HIGHEST ground under its
footprint, so on a slope it floats over the low side. Fix in two halves:

**lib/structures.js** — in `layoutStructures`, when pushing each entry,
also record the placement-time gap (pure arithmetic over `heights`, no
RNG draws, so determinism is untouched — every client computes the same
number from the same replicated inputs):

```js
// Inside the template loop, after computing x and y:
let shallowest = Infinity;
for (let c = Math.max(0, Math.floor(x - spec.w / 2));
     c <= Math.min(worldW - 1, Math.ceil(x + spec.w / 2)); c++) {
  if (heights[c] < shallowest) shallowest = heights[c];
}
out.push({
  /* ...existing fields... */
  // Depth of masonry platform under the base: the gap between the
  // highest and lowest ground across the footprint AT PLACEMENT.
  footing: Math.max(0, (worldH - y) - shallowest)
});
```

**index.html** — in `Game.drawStructures`, before each `drawStructure`
call (Aethercastle only — classic has no structures):

```js
ACStructures.drawFoundationAC(ctx, s, spec, theme, this.terrain.heights, CONST.WORLD_H);
```

Behaviour: at round start every building stands level — either flush on
flat ground (footing 0, nothing drawn) or on a coursed-stone plinth built
down to the slope. The plinth depth is CAPPED at `s.footing`, so terrain
blown out from under a building later leaves it hanging over the crater —
that read is intentional and must not be "fixed" by re-deriving footing
from live heights. The renderer only fills down to the CURRENT surface,
so a partially back-filled crater (Dirt Bomb) also renders correctly.
When `s.footing` is absent (older saves / until the lib change lands) the
renderer falls back to a 28px cap.

### 4. Projectiles (in `Game.draw`, ~line 6148)

Replace the `this.projectiles.forEach` dot-drawing block with:

```js
this.projectiles.forEach(p => {
  if (theme === THEMES.classic) {
    ctx.fillStyle = theme.fx.projectile;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.weapon && p.weapon.includes('Particle') ? 1.5 : 3, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ACWeapons.drawProjectileAC(ctx, p, theme);
  }
});
```

`drawProjectileAC` orients by `p.vx/p.vy` when present; if the live
projectile object stores velocity under other names, map them in.

### 5. Shields (in `Game.draw`, shield pass ~line 6178)

In the shield loop, keep the classic arc; on the Aethercastle path call:

```js
ACWeapons.drawShieldAC(ctx, tank, shieldConf ? shieldConf.colour : theme.fx.shieldFallback,
  shieldDeflects(tank.shield.type), theme);
```

Radius stays 12 at `(x, y-6)` — the kit matches the collision maths.

### 6. Explosions (`Game.drawExplosions`)

For each live explosion with centre `(x, y)`, blast radius `r` and a life
timer, compute `frac = elapsed / total` (0 just detonated → 1 done) and, on
the Aethercastle path only, call:

```js
ACWeapons.drawExplosionAC(ctx, x, y, r, frac, theme, weaponId);
```

Pass the weapon id that caused the burst (store it on the explosion entry
when it spawns if it is not already there — a render-visible field, not
simulation state). The id selects the burst tier: Baby Nuke / Nuke /
Meganuke throw a mushroom cloud with a double ground shockwave; Plasma /
Laser / Earth Disrupter implode violet with electric spokes; Napalm
splashes clinging fire; Riot puffs acid; the Dirt family fountains soil.
Nuke-family bursts read best with a longer life than a shell burst —
roughly 2× the standard explosion duration if the timer is per-weapon
configurable; leave the shared timer alone otherwise.

Keep the classic explosion exactly as it is.

## Acceptance checklist

- `node --test tests/` passes, including `render-classic-parity`,
  `render-purity`, `render-mutation-guard`, `theme-tokens`,
  `structures` and `structures-lockstep` (the new `footing` field is
  derived deterministically in `layoutStructures`; update any structure
  shape assertions to include it).
- `?mode=classic` renders byte-identical draw calls (green DOS screen,
  16×6 hull, plain gradient sky).
- Aethercastle solo game: banded night sky with stars/moon/far ridge;
  textured terrain in all four biomes; six distinct chassis; ten distinct
  structures with masonry, neon trim in the owner colour, hp bars, rubble
  on destruction; buildings on slopes stand on coursed-stone footings
  (never floating at round start; hanging only after terrain under them
  is blown away); per-family projectile sprites; latticed shields
  (deflectors doubled); pixel bursts.
- Terrain still deforms correctly (carve/deposit) — the kit re-derives its
  texture from `heights` every frame, so nothing to cache or invalidate.
- No new globals besides `ACG`, `ACSky`, `ACTerrain`, `ACChassis`,
  `ACStructures`, `ACWeapons`.
- Frame rate: the kit adds per-column loops over 1200 columns and hashed
  dither; if profiling shows a cost, cache the sky (it is static per
  round) into an offscreen canvas keyed by ramp — the ONLY permissible
  cache, because the sky alone never changes mid-round.

## Notes for follow-up passes (not this change)

- Shop / lobby DOM icons could reuse the same sprites via small offscreen
  canvases (`IconTile` in the design system names the sprite keys).
- `AETHERCASTLE_PLAN.md` mentions a planned 'drawTerrain uses only
  AC_BIOME colours' assertion; the kit derives shades from ramp/theme
  colours via `ACG.mix` — whitelist derived colours if that test lands.
