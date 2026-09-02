/**
 * Æthercastle munition, shield & burst sprites (gfx/ac-weapons.js)
 *
 * Replaces the one-dot-fits-all projectile with a sprite per weapon family,
 * plus latticed shield arcs and a pixel-art explosion. Weapon family is
 * derived from the projectile's weapon id string, so new weapons inherit a
 * sensible sprite automatically.
 *
 * drawProjectileAC(ctx, p, theme)
 *   p — live projectile ({x, y, vx, vy, weapon}) — vx/vy orient the sprite;
 *       a missing velocity falls back to pointing up.
 * drawShieldAC(ctx, tank, colour, deflects, theme)
 * drawExplosionAC(ctx, x, y, r, frac, theme, weaponId)
 *   frac — 0 (just detonated) .. 1 (finished); caller maps its own timer.
 *   weaponId (optional) picks the burst tier: the nuke family throws a
 *   mushroom cloud with a double shockwave, plasma/void weapons implode
 *   violet, napalm splashes fire, riot puffs acid, dirt fountains soil;
 *   everything else gets the standard shell burst.
 *
 * Draw-only, deterministic: spark positions hash from the burst's world
 * position and frame fraction; nothing touches an RNG stream or clock.
 */
(function () {
  'use strict';
  var ACG = (typeof module !== 'undefined' && module.exports)
    ? require('./ac-common.js')
    : window.ACG;

  function familyOf(weaponId) {
    var id = weaponId || '';
    if (id.indexOf('Particle') !== -1) return 'particle';
    if (id.indexOf('Meganuke') !== -1 || id === 'Nuke' || id === 'Baby Nuke') return 'nuke';
    if (id.indexOf('Roller') !== -1) return 'roller';
    if (id.indexOf('Dirt') !== -1 || id.indexOf('Sandstorm') !== -1 || id.indexOf('Sandhog') !== -1) return 'dirt';
    if (id.indexOf('Napalm') !== -1) return 'napalm';
    if (id.indexOf('Tracer') !== -1) return 'tracer';
    if (id.indexOf('MIRV') !== -1 || id.indexOf("Death's Head") !== -1 || id.indexOf('Cluster') !== -1 || id.indexOf('Funky') !== -1) return 'cluster';
    if (id.indexOf('Plasma') !== -1 || id.indexOf('Laser') !== -1 || id.indexOf('Disrupter') !== -1) return 'exotic';
    if (id.indexOf('Riot') !== -1) return 'riot';
    return 'missile';
  }

  function drawProjectileAC(ctx, p, theme) {
    var fam = familyOf(p.weapon);
    var vx = p.vx || 0, vy = p.vy || -1;
    var a = Math.atan2(vy, vx);

    ctx.save();
    switch (fam) {
      case 'particle': {
        ACG.glow(ctx, theme.fire500, 4, function () {
          ACG.px(ctx, p.x - 1, p.y - 1, 2, 2, theme.fire400);
        });
        break;
      }
      case 'tracer': {
        ACG.glow(ctx, theme.cyan500, 4, function () {
          ctx.fillStyle = theme.cyan400;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y - 2); ctx.lineTo(p.x + 2, p.y);
          ctx.lineTo(p.x, p.y + 2); ctx.lineTo(p.x - 2, p.y);
          ctx.closePath(); ctx.fill();
        });
        break;
      }
      case 'roller': {
        // Spiked clockwork ball; spikes rotate with travel (keyed off p.x).
        var rr = 3;
        ctx.fillStyle = theme.stone500;
        ctx.beginPath(); ctx.arc(p.x, p.y, rr, 0, Math.PI * 2); ctx.fill();
        var ph = (Math.floor(p.x) % 4) * (Math.PI / 8);
        ctx.fillStyle = theme.brass500;
        for (var sp2 = 0; sp2 < 4; sp2++) {
          var sa = ph + sp2 * (Math.PI / 2);
          ACG.px(ctx, p.x + Math.cos(sa) * (rr + 1) - 1, p.y + Math.sin(sa) * (rr + 1) - 1, 2, 2, theme.brass500);
        }
        ACG.glow(ctx, theme.violet500, 3, function () {
          ACG.px(ctx, p.x - 1, p.y - 1, 2, 2, theme.violet500);
        });
        break;
      }
      case 'dirt': {
        // A tumbling clod: brown lumps, no glow (nothing alchemical in dirt).
        ctx.fillStyle = '#735035';
        ctx.beginPath(); ctx.arc(p.x, p.y, 3, 0, Math.PI * 2); ctx.fill();
        ACG.px(ctx, p.x - 3, p.y - 1, 2, 2, '#8a6a48');
        ACG.px(ctx, p.x + 1, p.y + 1, 2, 2, '#5c3f28');
        ACG.px(ctx, p.x, p.y - 3, 2, 2, '#8a6a48');
        break;
      }
      case 'napalm': {
        ACG.glow(ctx, theme.fire600, 8, function () {
          ctx.fillStyle = theme.fire500;
          ctx.beginPath(); ctx.arc(p.x, p.y, 3, 0, Math.PI * 2); ctx.fill();
          ACG.px(ctx, p.x - 1, p.y - 4, 2, 2, theme.fire400);
        });
        break;
      }
      case 'exotic': {
        // Void-tier bolt: violet core, magenta halo.
        ACG.glow(ctx, theme.violet600, 10, function () {
          ctx.fillStyle = theme.violet500;
          ctx.beginPath(); ctx.arc(p.x, p.y, 3.5, 0, Math.PI * 2); ctx.fill();
        });
        ACG.px(ctx, p.x - 1, p.y - 1, 2, 2, theme.magenta400);
        break;
      }
      case 'riot': {
        ACG.glow(ctx, theme.acid500, 6, function () {
          ctx.fillStyle = theme.acid400;
          ctx.beginPath(); ctx.arc(p.x, p.y, 2.5, 0, Math.PI * 2); ctx.fill();
        });
        break;
      }
      case 'cluster': {
        // Bomblet carrier: body + two visible sub-charges.
        ctx.translate(p.x, p.y);
        ctx.rotate(a + Math.PI / 2);
        ACG.px(ctx, -2, -4, 4, 7, theme.stone400);
        ACG.px(ctx, -2, -4, 4, 1, theme.stone300);
        ACG.px(ctx, -2, -1, 2, 2, theme.violet500);
        ACG.px(ctx, 0, -1, 2, 2, theme.violet500);
        ACG.glow(ctx, theme.magenta500, 4, function () {
          ACG.px(ctx, -1, -5, 2, 1, theme.magenta500);
        });
        break;
      }
      case 'nuke': {
        // Big finned warhead with a magenta stripe and hot exhaust.
        ctx.translate(p.x, p.y);
        ctx.rotate(a + Math.PI / 2);
        ACG.px(ctx, -2.5, -5, 5, 9, theme.stone300);
        ACG.px(ctx, -2.5, -2, 5, 2, theme.magenta500);
        ctx.fillStyle = theme.stone400;
        ctx.beginPath(); ctx.moveTo(-2.5, 4); ctx.lineTo(-4.5, 7); ctx.lineTo(-2.5, 7); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.moveTo(2.5, 4); ctx.lineTo(4.5, 7); ctx.lineTo(2.5, 7); ctx.closePath(); ctx.fill();
        ctx.fillStyle = theme.stone200 || '#d8d2c8';
        ctx.beginPath(); ctx.moveTo(-2.5, -5); ctx.lineTo(2.5, -5); ctx.lineTo(0, -9); ctx.closePath(); ctx.fill();
        ACG.glow(ctx, theme.fire600, 8, function () {
          ACG.px(ctx, -1.5, 7, 3, 3, theme.fire500);
        });
        break;
      }
      case 'missile':
      default: {
        // Aether-strike missile: steel body, magenta stripe, cyan exhaust.
        ctx.translate(p.x, p.y);
        ctx.rotate(a + Math.PI / 2);
        ACG.px(ctx, -1.5, -4, 3, 7, theme.stone300);
        ACG.px(ctx, -1.5, -1, 3, 1.5, theme.magenta500);
        ctx.fillStyle = theme.stone400;
        ctx.beginPath(); ctx.moveTo(-1.5, 3); ctx.lineTo(-3, 5.5); ctx.lineTo(-1.5, 5.5); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.moveTo(1.5, 3); ctx.lineTo(3, 5.5); ctx.lineTo(1.5, 5.5); ctx.closePath(); ctx.fill();
        ACG.px(ctx, -1.5, -4, 3, 1, ACG.tint(theme.stone300, 0.4)); // nose glint
        ACG.glow(ctx, theme.cyan500, 6, function () {
          ACG.px(ctx, -1, 5.5, 2, 3, theme.cyan400);
        });
        break;
      }
    }
    ctx.restore();
  }

  /**
   * Shield arc over a hull: absorbers are a clean lattice arc, deflectors a
   * doubled arc (thicker read = it bounces). Radius 12 at (x, y-6), matching
   * the engine's collision maths.
   */
  function drawShieldAC(ctx, tank, colour, deflects, theme) {
    var cx = tank.x, cy = tank.y - 6, r = 12;
    ctx.save();
    ACG.glow(ctx, colour, 8, function () {
      ctx.strokeStyle = colour;
      ctx.lineWidth = deflects ? 3 : 2;
      ctx.beginPath();
      ctx.arc(cx, cy, r, Math.PI, 0);
      ctx.stroke();
      if (deflects) {
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(cx, cy, r - 3, Math.PI, 0);
        ctx.stroke();
      }
      // Lattice nodes at fixed angles.
      ctx.globalAlpha = 0.8;
      for (var n = 1; n < 6; n++) {
        var na = Math.PI + (n / 6) * Math.PI;
        ACG.px(ctx, cx + Math.cos(na) * r - 1, cy + Math.sin(na) * r - 1, 2, 2, colour);
      }
    });
    ctx.restore();
  }

  function burstFamilyOf(weaponId) {
    var id = weaponId || '';
    if (id.indexOf('Nuke') !== -1 || id.indexOf('Meganuke') !== -1) return 'nuke';
    if (id.indexOf('Plasma') !== -1 || id.indexOf('Laser') !== -1 || id.indexOf('Disrupter') !== -1) return 'void';
    if (id.indexOf('Napalm') !== -1) return 'napalm';
    if (id.indexOf('Riot') !== -1) return 'riot';
    if (id.indexOf('Dirt') !== -1 || id.indexOf('Sandhog') !== -1 || id.indexOf('Sandstorm') !== -1) return 'dirt';
    return 'burst';
  }

  /**
   * Pixel-art burst: white-hot core flash, chunky expanding ring of fire
   * pixels, deterministic spark spray hashed from the burst position.
   * Bigger weapon families escalate: see burstFamilyOf above.
   */
  function drawExplosionAC(ctx, x, y, r, frac, theme, weaponId) {
    frac = Math.max(0, Math.min(1, frac));
    var fam = burstFamilyOf(weaponId);
    if (fam === 'nuke') return drawNuke(ctx, x, y, r, frac, theme);
    if (fam === 'void') return drawVoidBurst(ctx, x, y, r, frac, theme);
    if (fam === 'napalm') return drawNapalmBurst(ctx, x, y, r, frac, theme);
    if (fam === 'riot') return drawRiotBurst(ctx, x, y, r, frac, theme);
    if (fam === 'dirt') return drawDirtBurst(ctx, x, y, r, frac, theme);
    drawStandardBurst(ctx, x, y, r, frac, theme);
  }

  function drawStandardBurst(ctx, x, y, r, frac, theme) {
    var ring = r * (0.3 + 0.7 * frac);
    var fade = 1 - frac;
    ctx.save();

    // Core flash, first third only.
    if (frac < 0.35) {
      var coreR = r * 0.45 * (1 - frac / 0.35);
      ACG.glow(ctx, theme.fx.burstFlash, 16, function () {
        ctx.fillStyle = theme.fx.burstFlash;
        ctx.beginPath(); ctx.arc(x, y, coreR, 0, Math.PI * 2); ctx.fill();
      });
    }

    // Ring: chunky 3px fire pixels on the circumference, not a smooth arc.
    ctx.globalAlpha = 0.85 * fade + 0.15;
    var steps = Math.max(10, Math.floor(ring * 0.9));
    for (var i = 0; i < steps; i++) {
      var a = (i / steps) * Math.PI * 2;
      var jitter = ACG.hash(Math.floor(x) + i, Math.floor(y) - i) * r * 0.14;
      var px2 = x + Math.cos(a) * (ring - jitter);
      var py2 = y + Math.sin(a) * (ring - jitter);
      ctx.fillStyle = (i % 3 === 0) ? theme.fx.burstFlash : (i % 3 === 1 ? theme.fx.burstCore : theme.fx.burstRing);
      ctx.fillRect(px2 - 1.5, py2 - 1.5, 3, 3);
    }

    // Sparks: a few flung pixels ahead of the ring.
    ctx.globalAlpha = fade;
    for (var s = 0; s < 8; s++) {
      var sa = ACG.hash(Math.floor(x) * 3 + s, Math.floor(y)) * Math.PI * 2;
      var sd = ring * (1.1 + ACG.hash(s, Math.floor(y) + s) * 0.5);
      ctx.fillStyle = theme.fx.burnSparks[s % theme.fx.burnSparks.length];
      ctx.fillRect(x + Math.cos(sa) * sd, y + Math.sin(sa) * sd, 2, 2);
    }

    ctx.restore();
  }

  // ── Nuke family: flash, double shockwave, stem and mushroom cap ──────
  function drawNuke(ctx, x, y, r, frac, theme) {
    var fade = 1 - frac;
    ctx.save();

    // Blinding flash first: a fast-expanding white-hot disc.
    if (frac < 0.22) {
      var ff = frac / 0.22;
      ACG.glow(ctx, theme.fx.burstFlash, 24, function () {
        ctx.globalAlpha = 1 - ff * 0.5;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath(); ctx.arc(x, y, r * 0.55 * ff + 4, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
      });
    }

    // Double shockwave rings racing outward along the ground plane.
    ctx.globalAlpha = 0.8 * fade;
    ctx.strokeStyle = theme.fx.burstFlash;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(x, y, r * 1.25 * frac + 2, r * 0.3 * frac + 1, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = theme.fx.burstRing;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.ellipse(x, y, r * 0.9 * frac + 1, r * 0.22 * frac + 1, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.globalAlpha = 1;

    // Stem: a rising column of chunky fire/smoke pixels.
    var rise = Math.min(1, frac * 1.5);
    var stemH = r * 1.1 * rise;
    var stemW = r * 0.3;
    for (var i = 0; i < 40; i++) {
      var hx = ACG.hash(Math.floor(x) + i, Math.floor(y));
      var hy2 = ACG.hash(i, Math.floor(y) + i);
      var pyy = y - stemH * hy2;
      var sway = (hx - 0.5) * stemW * (0.6 + hy2 * 0.8);
      var hot = hy2 < 0.35 && frac < 0.6;
      ctx.globalAlpha = (hot ? 0.95 : 0.75) * fade + 0.1;
      ctx.fillStyle = hot ? theme.fx.burstCore
        : theme.fx.smoke[i % theme.fx.smoke.length];
      var sz = 3 + Math.floor(hx * 3);
      ctx.fillRect(x + sway - sz / 2, pyy - sz / 2, sz, sz);
    }

    // Cap: the mushroom head, blooming and cooling from fire to smoke.
    var capY = y - stemH;
    var capW = r * (0.45 + 0.55 * frac);
    var capH = capW * 0.42;
    for (var c = 0; c < 56; c++) {
      var ha = ACG.hash(c, Math.floor(x) - c) * Math.PI * 2;
      var hd = Math.sqrt(ACG.hash(Math.floor(x) * 2 + c, c));
      var cx2 = x + Math.cos(ha) * capW * hd;
      var cy2 = capY - Math.abs(Math.sin(ha)) * capH * hd + capH * 0.2;
      var hot2 = hd < 0.45 && frac < 0.55;
      ctx.globalAlpha = (hot2 ? 0.95 : 0.8) * fade + 0.1;
      ctx.fillStyle = hot2 ? (c % 2 ? theme.fx.burstCore : theme.fx.burstFlash)
        : theme.fx.smoke[c % theme.fx.smoke.length];
      var sz2 = 3 + Math.floor(ACG.hash(c, c + 1) * 4);
      ctx.fillRect(cx2 - sz2 / 2, cy2 - sz2 / 2, sz2, sz2);
    }
    // A magenta aether scar at ground zero — this was an alchemical device.
    ACG.glow(ctx, theme.magenta600, 10, function () {
      ctx.globalAlpha = fade;
      ACG.px(ctx, x - r * 0.2, y - 1, r * 0.4, 2, theme.magenta500);
    });
    ctx.restore();
  }

  // ── Plasma / Laser / Disrupter: violet implosion, then a spoked flash ─
  function drawVoidBurst(ctx, x, y, r, frac, theme) {
    var fade = 1 - frac;
    ctx.save();
    // Collapsing ring: radius runs INWARD over the first half, then a
    // magenta flash kicks back out.
    var inR = frac < 0.5 ? r * (1 - frac * 1.6) + 3 : 3;
    ACG.glow(ctx, theme.violet600, 14, function () {
      ctx.strokeStyle = theme.violet500;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, y, Math.max(3, inR), 0, Math.PI * 2); ctx.stroke();
    });
    // Void core.
    ctx.fillStyle = '#08070a';
    ctx.beginPath(); ctx.arc(x, y, 3 + frac * 2, 0, Math.PI * 2); ctx.fill();
    // Electric spokes at fixed angles, jittered deterministically.
    ctx.globalAlpha = fade;
    ACG.glow(ctx, theme.magenta500, 8, function () {
      ctx.strokeStyle = theme.magenta400;
      ctx.lineWidth = 1;
      for (var s = 0; s < 6; s++) {
        var a = (s / 6) * Math.PI * 2 + ACG.hash(s, Math.floor(x)) * 0.5;
        var len = r * (0.4 + 0.6 * frac);
        ctx.beginPath();
        ctx.moveTo(x + Math.cos(a) * 4, y + Math.sin(a) * 4);
        ctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
        ctx.stroke();
      }
    });
    ctx.restore();
  }

  // ── Napalm: a low, wide splash of clinging fire ──────────────────────
  function drawNapalmBurst(ctx, x, y, r, frac, theme) {
    var fade = 1 - frac;
    var spread = r * 2 * Math.min(1, frac * 2 + 0.3);
    ctx.save();
    ctx.globalAlpha = 0.9 * fade + 0.1;
    for (var i = 0; i < 26; i++) {
      var hx = (ACG.hash(Math.floor(x) + i, i) - 0.5) * spread;
      var fh = 2 + ACG.hash(i, Math.floor(x)) * 7 * (1 - Math.abs(hx) / (spread * 0.6));
      if (fh < 2) continue;
      var c = i % 3 === 0 ? theme.fx.burstFlash : (i % 3 === 1 ? theme.fire500 : theme.fire600);
      ACG.glow(ctx, theme.fire600, 6, function () {
        ACG.px(ctx, x + hx, y - fh, 2, fh, c);
      });
    }
    // Rising smoke wisps late in the burn.
    if (frac > 0.4) {
      ctx.globalAlpha = fade * 0.6;
      for (var s2 = 0; s2 < 6; s2++) {
        var sxx = x + (ACG.hash(s2, Math.floor(y)) - 0.5) * spread * 0.8;
        ctx.fillStyle = theme.fx.smoke[s2 % theme.fx.smoke.length];
        ctx.fillRect(sxx, y - 10 - frac * 14 - s2, 2, 2);
      }
    }
    ctx.restore();
  }

  // ── Riot charges: harmless acid puff — digs, does not burn ───────────
  function drawRiotBurst(ctx, x, y, r, frac, theme) {
    var fade = 1 - frac;
    var ring = r * (0.3 + 0.7 * frac);
    ctx.save();
    ctx.globalAlpha = 0.85 * fade + 0.15;
    ACG.glow(ctx, theme.acid500, 8, function () {
      var steps = Math.max(8, Math.floor(ring * 0.7));
      for (var i = 0; i < steps; i++) {
        var a = (i / steps) * Math.PI * 2;
        var j = ACG.hash(Math.floor(x) + i, Math.floor(y)) * r * 0.16;
        ctx.fillStyle = i % 2 ? theme.acid400 : theme.acid500;
        ctx.fillRect(x + Math.cos(a) * (ring - j) - 1.5, y + Math.sin(a) * (ring - j) - 1.5, 3, 3);
      }
    });
    ctx.restore();
  }

  // ── Dirt family: a fountain of soil, no fire, no glow ────────────────
  function drawDirtBurst(ctx, x, y, r, frac, theme) {
    var fade = 1 - frac;
    ctx.save();
    ctx.globalAlpha = 0.9 * fade + 0.1;
    var clods = ['#735035', '#8a6a48', '#5c3f28', '#4a3220'];
    for (var i = 0; i < 30; i++) {
      var ha = (ACG.hash(Math.floor(x) + i, i) - 0.5) * Math.PI * 0.9 - Math.PI / 2;
      var spd = 0.5 + ACG.hash(i, Math.floor(y) + i) * 0.8;
      // Ballistic clod path: out along ha, pulled down by frac².
      var d = r * 1.3 * frac * spd;
      var cxx = x + Math.cos(ha) * d;
      var cyy = y + Math.sin(ha) * d + r * 1.1 * frac * frac;
      var sz = 2 + Math.floor(ACG.hash(i, i + 3) * 3);
      ctx.fillStyle = clods[i % clods.length];
      ctx.fillRect(cxx - sz / 2, cyy - sz / 2, sz, sz);
    }
    ctx.restore();
  }

  var API = {
    familyOf: familyOf,
    burstFamilyOf: burstFamilyOf,
    drawProjectileAC: drawProjectileAC,
    drawShieldAC: drawShieldAC,
    drawExplosionAC: drawExplosionAC
  };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = API;
  } else {
    window.ACWeapons = API;
  }
})();
