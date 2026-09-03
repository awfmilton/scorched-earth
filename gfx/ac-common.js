/**
 * Æthercastle sprite kit — shared helpers (gfx/ac-common.js)
 *
 * Draw-only, deterministic. No Math.random, no Date, no state writes:
 * everything is a pure function of its arguments, so two clients rendering
 * the same replicated world paint the same pixels (render-purity doctrine).
 *
 * Brand doctrine: metal is beveled and square, aether glows; the two
 * treatments never land on the same shape.
 *
 * Dual-load footer, matching lib/structures.js.
 */
(function () {
  'use strict';

  // Integer-coordinate hash -> [0,1). Pure and platform-stable.
  function hash(x, y) {
    var h = ((x | 0) * 374761393 + (y | 0) * 668265263) | 0;
    h = ((h ^ (h >>> 13)) * 1274126177) | 0;
    return (((h ^ (h >>> 16)) >>> 0) % 100000) / 100000;
  }

  function hexToRgb(hex) {
    var s = hex.replace('#', '');
    if (s.length === 3) s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2];
    var n = parseInt(s, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  function rgbToHex(r, g, b) {
    return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
  }

  // Mix two hex colours. t=0 -> a, t=1 -> b.
  function mix(a, b, t) {
    var ca = hexToRgb(a), cb = hexToRgb(b);
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    return rgbToHex(
      Math.round(ca[0] + (cb[0] - ca[0]) * t),
      Math.round(ca[1] + (cb[1] - ca[1]) * t),
      Math.round(ca[2] + (cb[2] - ca[2]) * t)
    );
  }

  function shade(c, t) { return mix(c, '#000000', t); }
  function tint(c, t) { return mix(c, '#ffffff', t); }

  // One pixel-art rect. The whole kit draws through this.
  function px(ctx, x, y, w, h, c) {
    ctx.fillStyle = c;
    ctx.fillRect(x, y, w, h);
  }

  /**
   * Deterministic dither fill: sprinkles `cell`-sized pixels of `colour`
   * over the rect at `density` (0..1). Seed offsets let two passes over the
   * same rect produce different but stable patterns.
   */
  function dither(ctx, x, y, w, h, colour, density, cell, seed) {
    cell = cell || 1;
    seed = seed || 0;
    ctx.fillStyle = colour;
    var x0 = Math.floor(x), y0 = Math.floor(y);
    for (var cy = y0; cy < y + h; cy += cell) {
      for (var cx = x0; cx < x + w; cx += cell) {
        if (hash(cx + seed * 7919, cy - seed * 104729) < density) {
          ctx.fillRect(cx, cy, cell, cell);
        }
      }
    }
  }

  // Aether: anything alchemically powered is drawn lit, never beveled.
  function glow(ctx, colour, blur, fn) {
    ctx.save();
    ctx.shadowColor = colour;
    ctx.shadowBlur = blur;
    fn();
    ctx.restore();
  }

  // Masonry / metal: square plate, lit top edge, shadowed bottom edge,
  // with a subtle left-light / right-dark pass for pixel-art volume.
  function plate(ctx, x, y, w, h, fill, lit, shadeC) {
    px(ctx, x, y, w, h, fill);
    if (h >= 3) {
      px(ctx, x, y, w, 1, lit);
      px(ctx, x, y + h - 1, w, 1, shadeC);
    }
    if (w >= 4 && h >= 4) {
      px(ctx, x, y + 1, 1, h - 2, mix(fill, lit, 0.4));
      px(ctx, x + w - 1, y + 1, 1, h - 2, mix(fill, shadeC, 0.5));
    }
  }

  // Rivet dots along a horizontal run.
  function rivets(ctx, x, y, w, colour, spacing) {
    spacing = spacing || 4;
    ctx.fillStyle = colour;
    for (var rx = x + 1; rx <= x + w - 2; rx += spacing) {
      ctx.fillRect(rx, y, 1, 1);
    }
  }

  /**
   * Stone masonry texture inside a rect: courses of blocks with dark mortar
   * lines and a few chipped highlights. Deterministic per world position.
   */
  function masonry(ctx, x, y, w, h, base, litC, darkC) {
    plate(ctx, x, y, w, h, base, litC, darkC);
    var course = 5;
    var mortar = mix(base, darkC, 0.55);
    ctx.fillStyle = mortar;
    var row = 0;
    for (var my = Math.floor(y) + course; my < y + h - 1; my += course, row++) {
      ctx.fillRect(x + 1, my, w - 2, 1);
      // Staggered verticals.
      var off = (row % 2) ? 4 : 0;
      for (var mx = Math.floor(x) + 3 + off; mx < x + w - 2; mx += 8) {
        ctx.fillRect(mx, my - course + 1, 1, course - 1);
      }
    }
    // Chips and highlights.
    dither(ctx, x + 1, y + 1, w - 2, h - 2, mix(base, litC, 0.35), 0.05, 1, 3);
    dither(ctx, x + 1, y + 1, w - 2, h - 2, mix(base, darkC, 0.4), 0.05, 1, 9);
  }

  /**
   * Crenellated parapet along the top edge of a wall: merlons `mw` wide,
   * `mh` tall, with an optional neon trim line in `neon` along the skyline.
   */
  function crenels(ctx, x, y, w, mw, mh, base, litC, darkC, neon) {
    var step = mw * 2;
    for (var cx = x; cx + mw <= x + w + 0.5; cx += step) {
      plate(ctx, cx, y - mh, mw, mh, base, litC, darkC);
    }
    if (neon) {
      glow(ctx, neon, 5, function () {
        ctx.fillStyle = neon;
        for (var cx2 = x; cx2 + mw <= x + w + 0.5; cx2 += step) {
          ctx.fillRect(cx2, y - mh, mw, 1);
        }
      });
    }
  }

  // A dark arched opening (door / gate mouth) with an optional glow inside.
  function archway(ctx, cx, groundY, w, h, dark, innerGlow) {
    ctx.fillStyle = dark;
    ctx.beginPath();
    ctx.arc(cx, groundY - h + w / 2, w / 2, Math.PI, 0);
    ctx.fill();
    ctx.fillRect(cx - w / 2, groundY - h + w / 2, w, h - w / 2);
    if (innerGlow) {
      glow(ctx, innerGlow, 6, function () {
        ctx.fillStyle = innerGlow;
        ctx.fillRect(cx - 1, groundY - h + w / 2, 2, h - w / 2);
      });
    }
  }

  /**
   * Trig for anything the kit draws that the SIMULATION also computes.
   *
   * Math.sin/cos are not required to be correctly rounded, so two engines can
   * disagree in the last bits. The game therefore carries its own polynomial
   * detSin/detCos, and the muzzle is the one place a sprite has to land on a
   * number the simulation already derived — a barrel drawn with Math.cos would
   * be a sprite that disagrees with where its own shell spawns.
   *
   * Defaults to Math so the kit stands alone (preview page, unit use); the
   * host calls setTrig() once at load to hand over the engine's pair.
   */
  var trig = { sin: Math.sin, cos: Math.cos };
  function setTrig(fns) {
    if (fns && typeof fns.sin === 'function' && typeof fns.cos === 'function') {
      trig = { sin: fns.sin, cos: fns.cos };
    }
  }
  function sin(x) { return trig.sin(x); }
  function cos(x) { return trig.cos(x); }

  var ACG = {
    hash: hash, mix: mix, shade: shade, tint: tint,
    px: px, dither: dither, glow: glow, plate: plate,
    rivets: rivets, masonry: masonry, crenels: crenels, archway: archway,
    setTrig: setTrig, sin: sin, cos: cos
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = ACG;
  } else {
    window.ACG = ACG;
  }
})();
