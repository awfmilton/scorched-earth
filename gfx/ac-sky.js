/**
 * Æthercastle sky / background painter (gfx/ac-sky.js)
 *
 * Replaces the flat sky gradient with a pixel-art night: banded gradient,
 * a deterministic starfield, a pale aether moon, and a far ridge with a
 * ruined-castle silhouette. Everything derives from the biome ramp passed
 * in, so all four biomes (and any future one) theme themselves.
 *
 * drawSkyAC(ctx, ramp, W, H)
 *   ramp — a BIOME_RAMPS.aethercastle entry ({sky, skyLow, crust, core, edge, glow})
 *   W, H — CONST.WORLD_W / CONST.WORLD_H
 *
 * Draw-only and deterministic (no RNG streams touched). Classic mode must
 * NOT route through this file — its sky is part of the DOS replica.
 */
(function () {
  'use strict';
  var ACG = (typeof module !== 'undefined' && module.exports)
    ? require('./ac-common.js')
    : window.ACG;

  function drawSkyAC(ctx, ramp, W, H) {
    if (!ctx || !ramp) return;

    // Banded sky: 8 hard steps instead of a smooth gradient — the pixel-art
    // read — darkest at the top. Band edges land on whole pixels: a
    // fractional fillRect edge antialiases the seam row into a blend colour
    // that softens exactly the hard step the bands exist for.
    var bands = 8;
    for (var b = 0; b < bands; b++) {
      var c = ACG.mix(ramp.sky, ramp.skyLow, b / (bands - 1));
      var top = Math.round((H / bands) * b);
      var next = Math.round((H / bands) * (b + 1));
      ACG.px(ctx, 0, top, W, (next - top) + 1, c);
    }

    // Starfield: sparse single pixels in the upper 55%, brighter ones rare.
    // Grid-cell hashed, so the field is identical every frame and client.
    var starDim = ACG.mix(ramp.skyLow, '#ffffff', 0.55);
    var starBright = ACG.mix(ramp.skyLow, '#ffffff', 0.85);
    for (var gy = 0; gy < H * 0.55; gy += 14) {
      for (var gx = 0; gx < W; gx += 14) {
        var r = ACG.hash(gx, gy);
        if (r < 0.16) {
          var sx = gx + Math.floor(ACG.hash(gx + 1, gy) * 12);
          var sy = gy + Math.floor(ACG.hash(gx, gy + 1) * 12);
          if (r < 0.03) {
            // A bright star gets a tiny cross.
            ACG.px(ctx, sx, sy, 1, 1, starBright);
            ACG.px(ctx, sx - 1, sy, 1, 1, starDim);
            ACG.px(ctx, sx + 1, sy, 1, 1, starDim);
            ACG.px(ctx, sx, sy - 1, 1, 1, starDim);
            ACG.px(ctx, sx, sy + 1, 1, 1, starDim);
          } else {
            ACG.px(ctx, sx, sy, 1, 1, starDim);
          }
        }
      }
    }

    // Aether moon: a pale disc with a violet-glow limb, upper right, drawn
    // as stacked pixel rows (no smooth arc).
    var mx = W * 0.82, my = H * 0.16, mr = 16;
    var moonFace = ACG.mix(ramp.sky, '#f6e9c6', 0.7);
    var moonShade = ACG.mix(ramp.sky, '#f6e9c6', 0.45);
    ACG.glow(ctx, 'rgba(155, 93, 224, 0.8)', 18, function () {
      for (var row = -mr; row <= mr; row += 2) {
        var half = Math.floor(Math.sqrt(mr * mr - row * row));
        ACG.px(ctx, mx - half, my + row, half * 2, 2, moonFace);
      }
    });
    // Craters.
    ACG.px(ctx, mx - 6, my - 4, 4, 3, moonShade);
    ACG.px(ctx, mx + 3, my + 2, 3, 2, moonShade);
    ACG.px(ctx, mx - 2, my + 7, 2, 2, moonShade);

    // Far ridge: a low silhouette band above the playfield midline, in a
    // colour between sky and ground so it sits behind everything.
    // Drawn through ACG.sin — the engine's deterministic pair — so two
    // clients on engines whose Math.sin differs in the last bit paint the
    // ridge on the same pixel. setTrig() fills these in at page load.
    var ridgeC = ACG.mix(ramp.skyLow, ramp.core, 0.55);
    var baseY = H * 0.52;
    ctx.fillStyle = ridgeC;
    ctx.beginPath();
    ctx.moveTo(0, H * 0.62);
    for (var x = 0; x <= W; x += 8) {
      var t = x / W;
      var y = baseY
        + ACG.sin(t * 9.2) * 14
        + ACG.sin(t * 23.7 + 2) * 7
        + ACG.sin(t * 3.1 + 5) * 22;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(W, H * 0.62);
    ctx.closePath();
    ctx.fill();

    // Ruined keep silhouette on the ridge: two broken towers and a wall,
    // one faint cyan window lit — the world beyond the battlefield.
    var kx = W * 0.31, ky = baseY + ACG.sin(0.31 * 9.2) * 14 + ACG.sin(0.31 * 23.7 + 2) * 7 + ACG.sin(0.31 * 3.1 + 5) * 22;
    ACG.px(ctx, kx - 20, ky - 18, 8, 18, ridgeC);
    ACG.px(ctx, kx + 10, ky - 24, 9, 24, ridgeC);
    ACG.px(ctx, kx - 14, ky - 10, 26, 10, ridgeC);
    // Broken crenels.
    ACG.px(ctx, kx - 20, ky - 21, 3, 3, ridgeC);
    ACG.px(ctx, kx + 10, ky - 27, 3, 3, ridgeC);
    ACG.px(ctx, kx + 16, ky - 27, 3, 3, ridgeC);
    ACG.glow(ctx, '#00bfff', 5, function () {
      ACG.px(ctx, kx + 13, ky - 18, 2, 3, '#00bfff');
    });

    // Low haze where sky meets ground, so the ridge recedes.
    var haze = ctx.createLinearGradient(0, H * 0.5, 0, H * 0.68);
    haze.addColorStop(0, 'rgba(0,0,0,0)');
    haze.addColorStop(1, hexA(ramp.skyLow, 0.55));
    ctx.fillStyle = haze;
    ctx.fillRect(0, H * 0.5, W, H * 0.18);
  }

  function hexA(hex, a) {
    var s = hex.replace('#', '');
    var n = parseInt(s, 16);
    return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
  }

  var API = { drawSkyAC: drawSkyAC };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = API;
  } else {
    window.ACSky = API;
  }
})();
