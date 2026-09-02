/**
 * Æthercastle terrain painter (gfx/ac-terrain.js)
 *
 * Replaces the smooth two-stop ground gradient with layered pixel-art
 * ground: a dark strata body, a thick lit crust band that follows the
 * surface, a per-biome fringe (grass blades on plains, scree on mountains,
 * sand ripples on plateau, heather ticks on hills), the bright surface
 * line, and the magenta aether bloom.
 *
 * drawTerrainAC(ctx, heights, ramp, W, H, biome)
 *   heights — the live Float32Array (depth from world bottom, index = column)
 *   ramp    — BIOME_RAMPS.aethercastle entry
 *   biome   — 'mountains' | 'plains' | 'plateau' | 'hills'
 *
 * Draw-only, deterministic: texture is hashed from world coordinates, so it
 * is stable across frames and identical on every client — and it survives
 * carve/deposit correctly because it re-derives from the current heights.
 * Classic mode must NOT route through this file.
 */
(function () {
  'use strict';
  var ACG = (typeof module !== 'undefined' && module.exports)
    ? require('./ac-common.js')
    : window.ACG;

  function drawTerrainAC(ctx, heights, ramp, W, H, biome) {
    if (!ctx || !heights || !ramp) return;
    var N = heights.length;

    // ── Ground body ────────────────────────────────────────────────────
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(0, H);
    for (var i = 0; i < N; i++) ctx.lineTo(i, H - heights[i]);
    ctx.lineTo(W, H);
    ctx.closePath();

    ctx.fillStyle = ramp.core;
    ctx.fill();
    ctx.clip(); // everything below stays inside the ground silhouette

    // Strata: horizontal sediment bands, brighter toward the crust colour,
    // broken up with dithered speckle so they read as rock, not stripes.
    var bandC1 = ACG.mix(ramp.core, ramp.crust, 0.18);
    var bandC2 = ACG.mix(ramp.core, ramp.crust, 0.10);
    for (var by = 0; by < H; by += 9) {
      ACG.px(ctx, 0, by, W, 2, (by / 9) % 2 ? bandC1 : bandC2);
    }
    // Speckle only the rows that can contain ground. The clip above hides
    // anything over the surface anyway, so hashing the whole 1200x700 rect
    // spent roughly half the pass on cells that could never draw. Starting
    // on an even row keeps every surviving cell on the same (cx, cy) hash
    // lattice as before — the visible pattern is unchanged.
    var peak = 0;
    for (var ph = 0; ph < N; ph++) {
      if (heights[ph] > peak) peak = heights[ph];
    }
    var groundTop = Math.max(0, Math.floor((H - peak) / 2) * 2 - 2);
    ACG.dither(ctx, 0, groundTop, W, H - groundTop, ACG.mix(ramp.core, ramp.crust, 0.3), 0.035, 2, 11);
    ACG.dither(ctx, 0, groundTop, W, H - groundTop, ACG.shade(ramp.core, 0.35), 0.04, 2, 23);

    // Buried aether veins: rare 2px seams of dim glow deep in the rock.
    // The hue comes from the live ramp's glow (an rgba string — ACG.mix is
    // hex-only, so the channels are lifted directly) at the vein's own
    // alpha, so a retuned or added biome keeps its veins on-theme. The
    // literal is only the fallback for a glow that fails to parse.
    var veinColour = 'rgba(213,0,127,0.16)';
    if (ramp.glow) {
      var gm = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/.exec(ramp.glow);
      if (gm) veinColour = 'rgba(' + gm[1] + ',' + gm[2] + ',' + gm[3] + ',0.16)';
    }
    ACG.dither(ctx, 0, Math.max(H * 0.55, groundTop), W, H * 0.45, veinColour, 0.012, 2, 41);

    // Crust band: an 8px-thick lit layer hugging the surface, then a 3px
    // darker transition under it. Drawn by re-stroking the surface polyline
    // with fat line widths inside the clip.
    ctx.beginPath();
    ctx.moveTo(0, H - heights[0]);
    for (var c = 1; c < N; c++) ctx.lineTo(c, H - heights[c]);
    ctx.lineWidth = 16;
    ctx.strokeStyle = ACG.mix(ramp.crust, ramp.core, 0.45);
    ctx.stroke();
    ctx.lineWidth = 9;
    ctx.strokeStyle = ramp.crust;
    ctx.stroke();

    // Crust speckle: chunky pixels in the band only (approximate by drawing
    // dither along the surface, still clipped to the ground).
    for (var sx = 0; sx < N; sx += 2) {
      var syTop = H - heights[sx];
      if (ACG.hash(sx, 77) < 0.3) {
        ACG.px(ctx, sx, syTop + 2 + Math.floor(ACG.hash(sx, 5) * 5), 2, 2,
          ACG.tint(ramp.crust, 0.18));
      }
      if (ACG.hash(sx, 91) < 0.22) {
        ACG.px(ctx, sx, syTop + 4 + Math.floor(ACG.hash(sx, 13) * 6), 2, 1,
          ACG.shade(ramp.crust, 0.3));
      }
    }
    ctx.restore(); // drop the ground clip

    // ── Surface line ───────────────────────────────────────────────────
    ctx.beginPath();
    ctx.moveTo(0, H - heights[0]);
    for (var e = 1; e < N; e++) ctx.lineTo(e, H - heights[e]);
    ctx.strokeStyle = ramp.edge;
    ctx.lineWidth = 2;
    ctx.stroke();

    // ── Biome fringe: what grows / lies on the surface ────────────────
    var fringeLit = ACG.tint(ramp.edge, 0.25);
    for (var fx = 0; fx < N; fx += 3) {
      var fy = H - heights[fx];
      var r = ACG.hash(fx, 3);
      if (biome === 'plains') {
        // Grass blades: 1px stalks, 1-3 tall, dense.
        if (r < 0.55) {
          var bh = 1 + Math.floor(ACG.hash(fx, 7) * 3);
          ACG.px(ctx, fx, fy - bh, 1, bh, r < 0.2 ? fringeLit : ramp.edge);
        }
      } else if (biome === 'mountains') {
        // Scree: small grey chips sitting on the line.
        if (r < 0.3) ACG.px(ctx, fx, fy - 2, 2, 2, r < 0.12 ? fringeLit : ACG.shade(ramp.crust, 0.15));
      } else if (biome === 'plateau') {
        // Sand ripples: short horizontal dashes.
        if (r < 0.35) ACG.px(ctx, fx, fy - 1, 3, 1, r < 0.15 ? fringeLit : ramp.edge);
      } else {
        // Hills: heather ticks, occasional taller sprig.
        if (r < 0.4) {
          var th = r < 0.08 ? 3 : 1;
          ACG.px(ctx, fx, fy - th, 1, th, r < 0.08 ? fringeLit : ramp.edge);
        }
      }
    }

    // ── Aether ground bloom (Aethercastle-only, ramp.glow gates it) ────
    if (ramp.glow) {
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(0, H - heights[0]);
      for (var g = 1; g < N; g++) ctx.lineTo(g, H - heights[g]);
      ctx.strokeStyle = ramp.glow;
      ctx.lineWidth = 10;
      ctx.stroke();
      ctx.restore();
    }
  }

  var API = { drawTerrainAC: drawTerrainAC };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = API;
  } else {
    window.ACTerrain = API;
  }
})();
