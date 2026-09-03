/**
 * Structures and defenses — the Aethercastle-only field mechanic.
 *
 * Until now the only thing on the map that could be hurt was a tank. A holding
 * gives every commander something to DEFEND: a castle that anchors the ground
 * they spawned on, a gatehouse and portcullis that physically stop a hull
 * driving through, and a ring of works that pay out, heal, shield or shoot.
 *
 * ── Why this is one shared module rather than a mirrored table ──────────────
 * CHASSIS is duplicated between lib/constants.js and index.html and is kept in
 * step by a drift test. Structures hold live state (hp, cooldown) and are
 * damaged by the simulation, so a drifted field here is not a cosmetic bug —
 * it is a client disagreeing about whether a castle is still standing. There
 * is therefore exactly ONE table, loaded by the browser with <script src> and
 * by node with require(), via the dual-load footer at the bottom.
 *
 * ── Determinism doctrine ───────────────────────────────────────────────────
 * Everything in here is a pure function of arguments that every client already
 * agrees on: the round seed, the roster, and the terrain heightmap. There is
 * no wall-clock, no Math.random, and no iteration over object key order in any
 * function that touches world state — layouts and effect passes walk ARRAYS by
 * index, because two engines may enumerate an object's keys in the same order
 * today and a structure that exists on one client and not another is the
 * silent desync in its purest form.
 *
 * Structures ride the existing lockstep channel rather than adding a new one:
 * they are rebuilt from (seed, roster) at ROUND_START and mutated only by
 * replicated events (an explosion from a FIRE_SYNC, a turn boundary). No new
 * wire message is needed, and none may be added without making every client
 * agree on its ordering first.
 *
 * `blocking` structures stop a tank crossing their footprint while they still
 * stand; `breach` fires once when hp reaches zero; `aura` and `income` are
 * applied in fixed passes at turn and round boundaries respectively.
 */

const STRUCTURES = {
  // ── Structures: the holding itself ──────────────────────────────────────
  'norman-castle': {
    id: 'norman-castle', name: 'Norman Castle', category: 'structure',
    hp: 420, w: 92, h: 66,
    // A castle is masonry: a hull does not drive through it.
    blocking: true,
    // The anchor of a holding. Losing it costs the owner the round's holding
    // bonus, which is what makes it worth shelling rather than ignoring.
    anchor: true, bounty: 1500,
    blurb: 'Curtain wall and motte. The thing you actually lose.'
  },
  'keep-gatehouse': {
    id: 'keep-gatehouse', name: 'Keep Gatehouse', category: 'structure',
    hp: 260, w: 56, h: 60,
    blocking: true,
    // While the gatehouse stands the holding's works are harder to kill: a
    // besieger has to breach the gate before the soft targets behind it.
    wardFactor: 0.55, wardRadius: 150,
    blurb: 'Twin drum towers over the gate. Wards the works behind it.'
  },
  'aether-forge': {
    id: 'aether-forge', name: 'Aether Forge', category: 'structure',
    hp: 200, w: 62, h: 42,
    // Pays its owner at the top of every round while it still stands.
    income: 450,
    blurb: 'Bottles raw aether into shot. Pays out every round it survives.'
  },

  // ── Defenses: the works ─────────────────────────────────────────────────
  'oil-vats': {
    id: 'oil-vats', name: 'Oil Vats', category: 'defense',
    hp: 90, w: 36, h: 26,
    // Damage on breach — the whole point of the thing. Shelling the vats is
    // how you crack a holding open, and parking next to them is how you die.
    breach: { damage: 80, radius: 104, carve: true },
    blurb: 'Boiling oil under pressure. Kills whatever cracks it.'
  },
  'portcullis': {
    id: 'portcullis', name: 'Portcullis', category: 'defense',
    hp: 140, w: 18, h: 48,
    // Pure denial: no damage, no aura, it simply will not let a hull past.
    blocking: true,
    blurb: 'Iron lattice. Blocks a hull outright until it is cut down.'
  },
  'scorpion-crossbow': {
    id: 'scorpion-crossbow', name: 'Scorpion Crossbow', category: 'defense',
    hp: 110, w: 32, h: 28,
    // Fires on its own at the end of the owner's turn, nearest enemy first.
    turret: { damage: 30, radius: 24, range: 430, cooldown: 1, carve: false },
    blurb: 'Torsion bolt-thrower. Looses at the nearest enemy each turn.'
  },
  'shield-dome': {
    id: 'shield-dome', name: 'Shield Dome', category: 'defense',
    hp: 150, w: 48, h: 36,
    // Tops friendly hulls back up to a floor rather than stacking forever, so
    // two domes are not twice as good as one.
    aura: { shield: 35, radius: 200 },
    blurb: 'Standing aether field. Keeps friendly hulls in a shield.'
  },
  'aether-radar': {
    id: 'aether-radar', name: 'Aether Radar', category: 'defense',
    hp: 100, w: 30, h: 46,
    // Tightens the owner's AI aim scatter while it stands. Deterministic:
    // it scales a jitter that is already drawn from the shared stream.
    aimAssist: 0.4,
    blurb: 'Resonance dish. Tightens the house gunners’ aim.'
  },
  'repair-bay': {
    id: 'repair-bay', name: 'Repair Bay', category: 'defense',
    hp: 130, w: 46, h: 30,
    // Heals over time — a few points per turn, capped at the hull's own max.
    aura: { repair: 14, radius: 180 },
    blurb: 'Gantry and rivet gun. Welds friendly hulls back together.'
  },
  'missile-silo': {
    id: 'missile-silo', name: 'Missile Silo', category: 'defense',
    hp: 180, w: 40, h: 38,
    // Slower and far heavier than the scorpion, and it reaches the whole map.
    turret: { damage: 70, radius: 46, range: 1200, cooldown: 3, carve: true },
    blurb: 'Aether-strike tube. Slow, map-wide, and it hurts.'
  }
};

const STRUCTURE_IDS = Object.keys(STRUCTURES);

// Only Aethercastle fields a holding. Classic mode keeps bare terrain and the
// one original tank — that absence is a large part of what makes it classic,
// so this is a hard gate rather than a default that a client could talk its
// way past.
const MODE_STRUCTURES = {
  aethercastle: STRUCTURE_IDS,
  classic: []
};

function structuresAllowedIn(mode) {
  return MODE_STRUCTURES[mode === 'classic' ? 'classic' : 'aethercastle'];
}

/**
 * The works every holding gets, in FIXED order.
 *
 * Order is load-bearing twice over: it is the order the layout consumes random
 * draws in, and the order effect passes run in. Reordering this array changes
 * the world every client builds, so it is a wire contract in all but name.
 */
// Ceiling on how many PURCHASED copies of one work a player can field.
// Bounds the structure array (and the per-round layout cost) no matter what
// count a hostile client declares in its inventory.
const MAX_PURCHASED_COPIES = 3;

const HOLDING_TEMPLATE = [
  'norman-castle',
  'keep-gatehouse',
  'portcullis',
  'oil-vats',
  'aether-forge',
  'scorpion-crossbow',
  'shield-dome',
  'repair-bay',
  'aether-radar',
  'missile-silo'
];

// How many works a holding fields at a given player count. Four holdings on a
// 1200px map cannot each have ten buildings without overlapping into a solid
// wall, so the template is truncated as the map gets busier.
function holdingSize(playerCount) {
  if (playerCount <= 2) return 10;
  if (playerCount === 3) return 7;
  return 5;
}

/**
 * Build the round's structures.
 *
 * Pure: same (rng stream position, mode, roster, heights) in, same array out.
 * The caller seeds the stream from the round seed, so every client that calls
 * this with the same ROUND_START builds the identical holding list.
 *
 * Returns [] for classic mode and for a missing roster, so every call site can
 * treat "no structures" as the normal case rather than a special one.
 */
function layoutStructures(rng, mode, roster, heights, worldW, worldH) {
  if (!structuresAllowedIn(mode).length) return [];
  if (!Array.isArray(roster) || roster.length === 0) return [];
  if (!heights || !heights.length) return [];

  const out = [];
  const count = holdingSize(roster.length);
  const zoneW = worldW / roster.length;

  // Walk the roster by INDEX, and the template by index inside it. Two nested
  // ordered loops, so the nth structure in the returned array is the same
  // structure on every client.
  for (let i = 0; i < roster.length; i++) {
    const tank = roster[i];
    const zoneStart = zoneW * i;

    for (let t = 0; t < count; t++) {
      const key = HOLDING_TEMPLATE[t];
      const spec = STRUCTURES[key];
      if (!spec) continue;

      // Spread the works across the owner's zone at fixed fractions, nudged by
      // a single draw each so two rounds do not look identical. The draw order
      // is (player, template index), fixed by the loops above.
      const slotFrac = (t + 0.5) / count;
      const jitter = rng.range(-0.035, 0.035);
      let x = zoneStart + zoneW * clamp(slotFrac + jitter, 0.06, 0.94);
      x = clamp(x, spec.w / 2 + 4, worldW - spec.w / 2 - 4);

      // Keep masonry off the hulls. blocksMovement() now lets a trapped tank
      // escape, but a tank standing inside a wall still looks wrong and robs
      // it of ground, so a blocking work is nudged clear of every tank before
      // it is placed. Deterministic: it reads only replicated roster
      // positions and draws no randomness, so the RNG sequence above is
      // untouched and every client lands on the same answer.
      if (spec.blocking) {
        x = clearOfTanks(x, spec.w, roster, worldW);
      }

      // Sit the footprint on the ground: the HIGHEST ground under it, so a
      // building never floats with one corner in the air over a dip.
      const y = groundUnder(heights, x, spec.w, worldW, worldH);

      // How deep a masonry platform the renderer has to build to make that
      // seating look deliberate: the drop from the highest ground under the
      // footprint to the lowest, measured AT PLACEMENT.
      //
      // Pure arithmetic over the replicated heights — no RNG draw — so the
      // stream above is untouched and every client computes the same number
      // from the same inputs. Recorded rather than re-derived at draw time on
      // purpose: terrain blown out from under a holding later must leave it
      // hanging over the crater, not silently grow a taller plinth.
      const from = Math.max(0, Math.floor(x - spec.w / 2));
      const to = Math.min(worldW - 1, Math.ceil(x + spec.w / 2));
      let shallowest = Infinity;
      for (let c = from; c <= to; c++) {
        if (heights[c] < shallowest) shallowest = heights[c];
      }
      const footing = Number.isFinite(shallowest)
        ? Math.max(0, (worldH - y) - shallowest)
        : 0;

      out.push({
        key: key,
        owner: Number.isInteger(tank.slot) ? tank.slot : i,
        ownerIdx: i,
        x: x,
        y: y,
        hp: spec.hp,
        maxHp: spec.hp,
        // Turrets start ready, so a holding can answer on the first turn.
        cooldown: 0,
        breached: false,
        footing: footing
      });
    }

    // PURCHASED works join the holding AFTER the template, walked in
    // registry order with a bounded copy count. The 'Structure: <id>'
    // inventory keys that drive this are replicated at every round start
    // (SHOP_DONE declares them, ROUND_START restates them), so every client
    // reads the same counts in the same order and draws the same jitter —
    // the nth structure in the returned array is still the same structure
    // everywhere.
    //
    // Two budgets bound the sprawl. The per-holding total reuses the same
    // holdingSize() crowding rule the template obeys — without it, four
    // players holding three of everything fielded 140 works and walls of
    // solid masonry. Blocking works are additionally capped at ONE copy
    // each: their whole effect is denial, and copies of a portcullis can
    // pocket a hull with no counterplay but a teleport.
    //
    // Copies are granted ROUND-ROBIN across the registry, one per id per
    // pass, so the budget starves nothing wholesale: a sequential walk
    // spent the whole allowance on the early ids and a paid-for
    // missile-silo (last in the registry) fielded zero copies every round.
    // Fixed iteration order, so every client grants identically.
    let purchasedBudget = count;
    const grants = new Array(STRUCTURE_IDS.length).fill(0);
    for (let pass = 0; pass < MAX_PURCHASED_COPIES && purchasedBudget > 0; pass++) {
      for (let p = 0; p < STRUCTURE_IDS.length && purchasedBudget > 0; p++) {
        const key = STRUCTURE_IDS[p];
        const spec = STRUCTURES[key];
        if (!spec) continue;
        const held = tank && tank.inventory
          ? tank.inventory['Structure: ' + key]
          : 0;
        if (!Number.isInteger(held)) continue;
        const perIdCap = spec.blocking ? 1 : MAX_PURCHASED_COPIES;
        if (grants[p] < Math.min(held, perIdCap)) {
          grants[p]++;
          purchasedBudget--;
        }
      }
    }
    for (let p = 0; p < STRUCTURE_IDS.length; p++) {
      const key = STRUCTURE_IDS[p];
      const spec = STRUCTURES[key];
      if (!spec) continue;
      const copies = grants[p];
      for (let c = 0; c < copies; c++) {
        let x = zoneStart + zoneW * clamp(rng.range(0.08, 0.92), 0.06, 0.94);
        x = clamp(x, spec.w / 2 + 4, worldW - spec.w / 2 - 4);
        if (spec.blocking) {
          x = clearOfTanks(x, spec.w, roster, worldW);
        }
        const y = groundUnder(heights, x, spec.w, worldW, worldH);
        const from = Math.max(0, Math.floor(x - spec.w / 2));
        const to = Math.min(worldW - 1, Math.ceil(x + spec.w / 2));
        let shallowest = Infinity;
        for (let cc = from; cc <= to; cc++) {
          if (heights[cc] < shallowest) shallowest = heights[cc];
        }
        out.push({
          key: key,
          owner: Number.isInteger(tank.slot) ? tank.slot : i,
          ownerIdx: i,
          x: x,
          y: y,
          hp: spec.hp,
          maxHp: spec.hp,
          cooldown: 0,
          breached: false,
          footing: Number.isFinite(shallowest)
            ? Math.max(0, (worldH - y) - shallowest)
            : 0,
          purchased: true
        });
      }
    }
  }

  return out;
}

function clamp(v, lo, hi) {
  return v < lo ? lo : (v > hi ? hi : v);
}

// Room a tank needs beside a blocking footprint: half the widest hull (22/2)
// plus the longest chassis stride (8), rounded up. At this distance any
// chassis stands fully clear and can still take a whole step without
// re-entering the footprint.
const TANK_CLEARANCE = 20;

/**
 * Slide a blocking footprint off any tank it covers.
 *
 * Walks the roster by index and shifts to whichever side is nearer, re-clamping
 * into the world each time; a shift that lands on a second tank is resolved by
 * the next pass. Pure and draw-free, so two clients with the same roster agree.
 *
 * Always returns a position: a crowded zone yields the best-effort x rather
 * than dropping the work. Dropping measured at 13 of 400 holdings losing their
 * norman-castle outright, and blocksMovement() already guarantees a hull can
 * drive out of a footprint, so a rare overlap costs looks, not playability.
 */
function clearOfTanks(x, w, roster, worldW) {
  const lo = w / 2 + 4;
  const hi = worldW - w / 2 - 4;
  const need = w / 2 + TANK_CLEARANCE;

  for (let pass = 0; pass < 4; pass++) {
    let moved = false;
    for (let i = 0; i < roster.length; i++) {
      const tx = roster[i] && roster[i].x;
      if (!Number.isFinite(tx)) continue;
      const gap = x - tx;
      if (Math.abs(gap) >= need) continue;
      x = clamp(gap >= 0 ? tx + need : tx - need, lo, hi);
      moved = true;
    }
    if (!moved) break;
  }
  return x;
}

// Screen y of the topmost ground beneath a footprint. heights[] is depth from
// the bottom of the world, so screen y is worldH - height.
function groundUnder(heights, cx, w, worldW, worldH) {
  const from = Math.max(0, Math.floor(cx - w / 2));
  const to = Math.min(worldW - 1, Math.ceil(cx + w / 2));
  let tallest = 0;
  for (let c = from; c <= to; c++) {
    const h = heights[c];
    if (h > tallest) tallest = h;
  }
  return worldH - tallest;
}

/**
 * Is a structure still standing? Destroyed works stop blocking, stop firing
 * and stop paying, but stay in the array so that every client's structure
 * INDICES keep matching — removing entries mid-round would make the arrays
 * diverge the moment two clients destroyed things in a different order.
 */
function isStanding(s) {
  return !!s && s.hp > 0;
}

function specOf(s) {
  return (s && STRUCTURES[s.key]) || null;
}

/**
 * Horizontal barrier test used by tank movement.
 *
 * Returns true if moving from x0 to x1 would cross the footprint of a standing
 * blocking structure. Arithmetic only — no RNG, no floats beyond the terrain's
 * own — so every client stops a hull at the same pixel.
 *
 * A structure's own owner is blocked too: a portcullis is a wall, not a gate
 * that recognises its house colours. That also keeps the rule symmetric, which
 * is what stops it becoming a per-client judgement call.
 */
function blocksMovement(structures, x0, x1) {
  if (!structures || !structures.length) return false;
  const lo = Math.min(x0, x1);
  const hi = Math.max(x0, x1);

  for (let i = 0; i < structures.length; i++) {
    const s = structures[i];
    if (!isStanding(s)) continue;
    const spec = specOf(s);
    if (!spec || !spec.blocking) continue;

    const left = s.x - spec.w / 2;
    const right = s.x + spec.w / 2;

    // A hull ALREADY inside this footprint is not blocked by it. Masonry stops
    // a hull driving INTO a wall; it must never be able to seal one in. The
    // plain [lo,hi] overlap test this replaces returned true in BOTH directions
    // for a tank standing inside a footprint, which left roughly one tank in
    // five immobile for the entire round.
    if (x0 >= left && x0 <= right) continue;

    // Otherwise the step is blocked if it ends inside the footprint, or clears
    // it in one stride (a wall narrower than the stride is still a wall).
    if ((x1 >= left && x1 <= right) || (lo <= left && hi >= right)) return true;
  }
  return false;
}

/**
 * Damage multiplier applied to a structure, given the rest of the holding.
 *
 * An intact gatehouse wards nearby works of the SAME owner, so the soft
 * targets behind a gate take reduced damage until the gate itself is down.
 * Walks the array by index and multiplies; with no gatehouse standing it
 * returns exactly 1 and changes nothing.
 */
function wardMultiplier(structures, target) {
  if (!structures || !target) return 1;
  // The BEST single ward wins; wards do not stack. A multiplied product let
  // purchasable gatehouse copies compound to 0.55^4 ≈ 0.09x damage — cash
  // buying near-invulnerability. Same non-stacking rule shield-dome auras
  // already follow.
  let best = 1;
  for (let i = 0; i < structures.length; i++) {
    const s = structures[i];
    if (s === target) continue;
    if (!isStanding(s)) continue;
    if (s.owner !== target.owner) continue;
    const spec = specOf(s);
    if (!spec || !spec.wardFactor) continue;
    const dx = s.x - target.x;
    const dy = s.y - target.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist <= spec.wardRadius && spec.wardFactor < best) {
      best = spec.wardFactor;
    }
  }
  return best;
}

// Dual-load footer, matching lib/terrain.js: require() in node, a global in
// the browser via <script src>.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    STRUCTURES,
    STRUCTURE_IDS,
    MODE_STRUCTURES,
    HOLDING_TEMPLATE,
    MAX_PURCHASED_COPIES,
    structuresAllowedIn,
    holdingSize,
    layoutStructures,
    isStanding,
    specOf,
    blocksMovement,
    wardMultiplier,
    groundUnder
  };
} else {
  window.Structures = {
    STRUCTURES,
    STRUCTURE_IDS,
    MODE_STRUCTURES,
    HOLDING_TEMPLATE,
    MAX_PURCHASED_COPIES,
    structuresAllowedIn,
    holdingSize,
    layoutStructures,
    isStanding,
    specOf,
    blocksMovement,
    wardMultiplier,
    groundUnder
  };
}
