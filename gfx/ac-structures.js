/**
 * Æthercastle structure & defense sprites (gfx/ac-structures.js)
 *
 * Drop-in replacements for drawStructure() / drawRubble(). Each sprite
 * fills the SAME footprint the simulation collides against (spec.w × spec.h,
 * centred on s.x, grounded at s.y) — footprints are wire contracts and must
 * not change. All added character is texture inside the box: masonry
 * courses, crenellated parapets with neon trim, brass fittings, and aether
 * glow only on the alchemically powered parts.
 *
 * drawStructureAC(ctx, s, spec, theme, ownerColour)
 * drawRubbleAC(ctx, left, groundY, w, h, theme)
 * drawFoundationAC(ctx, s, spec, theme, heights, worldH)
 *   — call BEFORE drawStructureAC: a coursed-masonry plinth that fills the
 *     gap between the building's base line (s.y) and the terrain under its
 *     footprint, so a work placed on a slope stands on a built platform
 *     instead of floating. Depth is capped at s.footing (the gap recorded
 *     at layout time); terrain blown out DEEPER than that later leaves the
 *     plinth hanging over the crater — a mined base reads as mined.
 *
 * States preserved from the original renderer: standing / damaged (hp bar),
 * breached-and-spent scorch, destroyed rubble, owner pip. Draw-only,
 * deterministic: texture hashes from world position; nothing reads a clock
 * or an RNG stream.
 */
(function () {
  'use strict';
  var ACG = (typeof module !== 'undefined' && module.exports)
    ? require('./ac-common.js')
    : window.ACG;

  function drawRubbleAC(ctx, left, groundY, w, h, theme) {
    var rubbleH = Math.max(4, h * 0.18);
    // Broken mound with masonry chunks poking out.
    ACG.plate(ctx, left, groundY - rubbleH, w, rubbleH, theme.stone800, theme.stone600, theme.void900);
    ACG.dither(ctx, left, groundY - rubbleH, w, rubbleH, theme.stone700, 0.25, 2, 5);
    // Stumps at fixed fractions (same places every client).
    ACG.plate(ctx, left + w * 0.12, groundY - rubbleH - h * 0.10, w * 0.14, h * 0.10, theme.stone700, theme.stone500, theme.void900);
    ACG.plate(ctx, left + w * 0.68, groundY - rubbleH - h * 0.07, w * 0.11, h * 0.07, theme.stone700, theme.stone500, theme.void900);
    // Scattered blocks.
    ACG.px(ctx, left + w * 0.4, groundY - rubbleH - 2, 3, 2, theme.stone600);
    ACG.px(ctx, left + w * 0.55, groundY - rubbleH - 1, 2, 1, theme.stone500);
  }

  function drawFoundationAC(ctx, s, spec, theme, heights, worldH) {
    if (!heights || !heights.length || s.hp <= 0) return;
    var w = spec.w;
    var left = Math.floor(s.x - w / 2) - 1;
    var right = Math.ceil(s.x + w / 2) + 1;
    // Cap at the placement-time gap; fall back to a modest default when the
    // engine has not recorded one yet.
    var cap = (typeof s.footing === 'number' && isFinite(s.footing)) ? s.footing : 28;
    if (cap <= 0) return;
    var maxY = s.y + cap;
    var topY = Math.floor(s.y);
    var drew = false;
    for (var c = left; c <= right; c++) {
      var col = Math.max(0, Math.min(heights.length - 1, c));
      var gy = worldH - heights[col];
      var bottom = Math.min(gy + 1, maxY);
      var gap = bottom - topY;
      if (gap <= 0.5) continue;
      drew = true;
      // Column of ashlar, darker than the wall above so the plinth reads
      // as foundation, with a battered (stepped-out) outer edge.
      var edge = (c <= left + 1 || c >= right - 1);
      ACG.px(ctx, c, topY, 1, gap, edge ? theme.stone800 : theme.stone700);
      // Mortar courses every 4px, staggered per column.
      for (var my = topY + 3 + ((c % 2) ? 0 : 2); my < topY + gap - 1; my += 4) {
        ACG.px(ctx, c, my, 1, 1, theme.void900);
      }
      // Occasional lit chip.
      if (ACG.hash(c, topY) < 0.12) {
        ACG.px(ctx, c, topY + 1 + Math.floor(ACG.hash(c, 3) * Math.max(1, gap - 2)), 1, 1, theme.stone500);
      }
    }
    if (drew) {
      // Top course: a lit string-line under the building's base.
      ACG.px(ctx, left, topY, right - left + 1, 1, theme.stone500);
    }
  }

  function drawStructureAC(ctx, s, spec, theme, ownerColour) {
    var w = spec.w, h = spec.h;
    var left = s.x - w / 2;
    var top = s.y - h;
    var maxHp = s.maxHp || spec.hp || 1;
    var frac = Math.max(0, Math.min(1, s.hp / maxHp));
    var neon = ownerColour || theme.magenta500;

    ctx.save();

    if (s.hp <= 0) {
      drawRubbleAC(ctx, left, s.y, w, h, theme);
      if (s.breached && spec.breach) {
        ctx.globalAlpha = 0.5;
        ctx.fillStyle = theme.fire600;
        ctx.fillRect(left, s.y - 2, w, 2);
      }
      ctx.restore();
      return;
    }

    var stone = theme.stone600, lit = theme.stone300, shade = theme.void900;

    switch (s.key) {
      case 'norman-castle': {
        // Motte-and-bailey: two corner drum towers, curtain wall, tall keep.
        var wallTop = top + h * 0.34;
        var towerW = w * 0.16;
        // Keep (behind).
        ACG.masonry(ctx, left + w * 0.36, top + h * 0.06, w * 0.28, h * 0.6, theme.stone700, theme.stone500, shade);
        ACG.crenels(ctx, left + w * 0.36, top + h * 0.06, w * 0.28, 3, 4, theme.stone700, theme.stone500, shade, neon);
        // Keep windows.
        ACG.glow(ctx, theme.cyan500, 4, function () {
          ACG.px(ctx, s.x - 1, top + h * 0.14, 2, 4, theme.cyan400);
          ACG.px(ctx, s.x - 6, top + h * 0.2, 2, 3, theme.cyan400);
          ACG.px(ctx, s.x + 4, top + h * 0.2, 2, 3, theme.cyan400);
        });
        // Curtain wall.
        ACG.masonry(ctx, left + towerW * 0.7, wallTop, w - towerW * 1.4, h - (wallTop - top), stone, lit, shade);
        ACG.crenels(ctx, left + towerW * 0.7, wallTop, w - towerW * 1.4, 3, 4, stone, lit, shade, neon);
        // Corner towers.
        ACG.masonry(ctx, left, wallTop - h * 0.12, towerW, h - (wallTop - top) + h * 0.12, stone, lit, shade);
        ACG.masonry(ctx, left + w - towerW, wallTop - h * 0.12, towerW, h - (wallTop - top) + h * 0.12, stone, lit, shade);
        ACG.crenels(ctx, left, wallTop - h * 0.12, towerW, 2.5, 3.5, stone, lit, shade, neon);
        ACG.crenels(ctx, left + w - towerW, wallTop - h * 0.12, towerW, 2.5, 3.5, stone, lit, shade, neon);
        // Arrow slits on the towers.
        ACG.px(ctx, left + towerW / 2 - 1, wallTop + h * 0.1, 1, 4, shade);
        ACG.px(ctx, left + w - towerW / 2, wallTop + h * 0.1, 1, 4, shade);
        // Gate: neon-lit arch with portcullis bars.
        ACG.archway(ctx, s.x, s.y, w * 0.13, h * 0.26, theme.void800, null);
        ctx.strokeStyle = theme.brass700;
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (var gb = -1; gb <= 1; gb++) {
          ctx.moveTo(s.x + gb * (w * 0.04), s.y - h * 0.24);
          ctx.lineTo(s.x + gb * (w * 0.04), s.y);
        }
        ctx.stroke();
        ACG.glow(ctx, neon, 6, function () {
          ctx.strokeStyle = neon;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(s.x, s.y - h * 0.26 + w * 0.065, w * 0.065 + 1, Math.PI, 0);
          ctx.stroke();
        });
        break;
      }
      case 'keep-gatehouse': {
        // Twin drum towers flanking a warded arch.
        ACG.masonry(ctx, left, top, w * 0.3, h, stone, lit, shade);
        ACG.masonry(ctx, left + w * 0.7, top, w * 0.3, h, stone, lit, shade);
        ACG.crenels(ctx, left, top, w * 0.3, 2.5, 3.5, stone, lit, shade, neon);
        ACG.crenels(ctx, left + w * 0.7, top, w * 0.3, 2.5, 3.5, stone, lit, shade, neon);
        // Bridge wall between them.
        ACG.masonry(ctx, left + w * 0.3, top + h * 0.18, w * 0.4, h * 0.82, ACG.shade(stone, 0.1), lit, shade);
        // Arrow slits.
        ACG.px(ctx, left + w * 0.14, top + h * 0.25, 1, 5, shade);
        ACG.px(ctx, left + w * 0.84, top + h * 0.25, 1, 5, shade);
        // Arch with cyan ward shimmer inside.
        ACG.archway(ctx, s.x, s.y, w * 0.32, h * 0.44, theme.void800, null);
        ACG.glow(ctx, theme.cyan600, 8, function () {
          ctx.strokeStyle = theme.cyan500;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(s.x, s.y - h * 0.44 + w * 0.16, w * 0.16, Math.PI, 0);
          ctx.stroke();
        });
        // Brass ward lintel.
        ACG.px(ctx, left + w * 0.3, top + h * 0.18, w * 0.4, 2, theme.brass600);
        ACG.rivets(ctx, left + w * 0.3, top + h * 0.18, w * 0.4, theme.brass400, 4);
        break;
      }
      case 'portcullis': {
        // Iron lattice with brass frame and glow studs at the crossings.
        ACG.px(ctx, left, top, 2, h, theme.stone700);
        ACG.px(ctx, left + w - 2, top, 2, h, theme.stone700);
        ctx.fillStyle = theme.brass700;
        for (var pb = 0; pb < 3; pb++) ctx.fillRect(left + 2 + pb * ((w - 5) / 2), top, 2, h);
        for (var hb = 0; hb < 4; hb++) ctx.fillRect(left, top + 2 + hb * ((h - 6) / 3), w, 2);
        // Spiked feet.
        for (var sp = 0; sp < 3; sp++) {
          var spx = left + 2 + sp * ((w - 5) / 2);
          ctx.fillStyle = theme.brass600;
          ctx.beginPath();
          ctx.moveTo(spx, s.y); ctx.lineTo(spx + 2, s.y); ctx.lineTo(spx + 1, s.y + 2);
          ctx.closePath(); ctx.fill();
        }
        ACG.glow(ctx, neon, 3, function () {
          for (var gy2 = 0; gy2 < 4; gy2++) {
            ACG.px(ctx, left + 2, top + 2 + gy2 * ((h - 6) / 3), 1, 1, neon);
          }
        });
        break;
      }
      case 'oil-vats': {
        // The concept-sheet vat: ONE large coopered barrel — stone staves,
        // brass hoops, an overhanging lid with a handle, a side spigot
        // dripping magenta oil into a puddle — plus the armed fire sheen.
        var vw = w * 0.72, vh = h * 0.8;
        var vL = s.x - vw / 2 - w * 0.06, vt = top + h * 0.2;
        // Staved body.
        ACG.plate(ctx, vL, vt, vw, vh, theme.stone700, theme.stone500, shade);
        ctx.fillStyle = ACG.shade(theme.stone700, 0.3);
        for (var st = 1; st < 4; st++) ctx.fillRect(vL + (vw / 4) * st, vt + 1, 1, vh - 2);
        // Brass hoops.
        ACG.px(ctx, vL - 1, vt + vh * 0.22, vw + 2, 2, theme.brass600);
        ACG.px(ctx, vL - 1, vt + vh * 0.68, vw + 2, 2, theme.brass600);
        ACG.rivets(ctx, vL - 1, vt + vh * 0.22, vw + 2, theme.brass400, 4);
        // Overhanging lid with handle.
        ACG.plate(ctx, vL - 2, vt - 3, vw + 4, 3, theme.brass700, theme.brass500, shade);
        ACG.px(ctx, s.x - w * 0.06 - 2, vt - 5, 4, 2, theme.brass500);
        // Spigot on the right, dripping into a puddle.
        ACG.px(ctx, vL + vw, vt + vh * 0.55, 3, 2, theme.brass500);
        ACG.glow(ctx, theme.magenta600, 5, function () {
          ACG.px(ctx, vL + vw + 2, vt + vh * 0.57, 1, s.y - (vt + vh * 0.57) - 1, theme.magenta500);
          ACG.px(ctx, vL + vw - 1, s.y - 1, 7, 1, theme.magenta600);
          ACG.px(ctx, vL + vw + 1, s.y - 2, 3, 1, theme.magenta500);
        });
        // Armed fire sheen across the body.
        ACG.glow(ctx, theme.fire600, 8, function () {
          ACG.px(ctx, vL + 2, vt + vh * 0.42, vw - 4, 2, theme.fire500);
        });
        break;
      }
      case 'aether-forge': {
        // Stone hall, gear on the gable, chimney, roaring magenta forge mouth.
        ACG.masonry(ctx, left, top + h * 0.3, w, h * 0.7, stone, lit, shade);
        // Roof course.
        ACG.plate(ctx, left - 1, top + h * 0.26, w + 2, h * 0.08, theme.stone700, theme.stone500, shade);
        // Chimney with ember.
        ACG.plate(ctx, left + w * 0.66, top, w * 0.14, h * 0.34, theme.stone700, theme.stone500, shade);
        ACG.glow(ctx, theme.fire600, 4, function () {
          ACG.px(ctx, left + w * 0.7, top - 2, w * 0.06, 2, theme.fire500);
        });
        // Wall gear: brass ring with tooth pixels.
        var gx = left + w * 0.82, gy = top + h * 0.52, gr = h * 0.12;
        ctx.strokeStyle = theme.brass500;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(gx, gy, gr, 0, Math.PI * 2);
        ctx.stroke();
        for (var tth = 0; tth < 8; tth++) {
          var ta = (tth / 8) * Math.PI * 2;
          ACG.px(ctx, gx + Math.cos(ta) * (gr + 2) - 1, gy + Math.sin(ta) * (gr + 2) - 1, 2, 2, theme.brass600);
        }
        // Forge mouth: magenta blaze under a brass lintel.
        ACG.px(ctx, left + w * 0.1, top + h * 0.48, w * 0.38, 2, theme.brass600);
        ACG.glow(ctx, theme.magenta600, 12, function () {
          ACG.px(ctx, left + w * 0.12, top + h * 0.5, w * 0.34, h * 0.34, theme.magenta500);
          ACG.px(ctx, left + w * 0.18, top + h * 0.56, w * 0.22, h * 0.2, theme.magenta400);
        });
        break;
      }
      case 'scorpion-crossbow': {
        // The concept-sheet scorpion: a proper crossbow in profile — timber
        // mount, tilted stock rail, two RECURVED limbs at the muzzle end,
        // taut string back to a winch drum, and a brass bolt with a glowing
        // head seated on the rail.
        var mountH = h * 0.3;
        // Timber base with brass strapping.
        ACG.plate(ctx, left, s.y - mountH, w, mountH, theme.stone700, theme.brass600, shade);
        ACG.rivets(ctx, left, s.y - mountH + 1, w, theme.brass400, 4);
        // Pivot post under the stock.
        ACG.px(ctx, s.x - 2, s.y - mountH - 3, 4, 3, theme.stone500);
        ACG.px(ctx, s.x - 1, s.y - mountH - 4, 2, 1, theme.brass500);
        // Stock rail: thick timber, tilted up toward the muzzle (right).
        var railBx = left + w * 0.08, railBy = s.y - mountH - 3;      // butt
        var railMx = left + w * 0.92, railMy = top + h * 0.18;        // muzzle
        ctx.strokeStyle = theme.stone500;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(railBx, railBy);
        ctx.lineTo(railMx, railMy);
        ctx.stroke();
        ctx.strokeStyle = theme.brass600; // brass track on top of the rail
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(railBx, railBy - 2);
        ctx.lineTo(railMx, railMy - 2);
        ctx.stroke();
        // Winch drum at the butt with crank handle.
        ACG.px(ctx, railBx - 2, railBy - 3, 4, 5, theme.brass600);
        ACG.px(ctx, railBx - 1, railBy - 2, 2, 3, theme.brass400);
        ACG.px(ctx, railBx - 4, railBy - 1, 2, 1, theme.brass500);
        // Recurved limbs at the muzzle: two arcs sweeping back from the
        // rail tip, brass-capped.
        var limbTopX = railMx - w * 0.08, limbTopY = railMy - h * 0.34;
        var limbBotX = railMx - w * 0.08, limbBotY = railMy + h * 0.3;
        ctx.strokeStyle = theme.stone400;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(railMx, railMy);
        ctx.quadraticCurveTo(railMx + w * 0.1, railMy - h * 0.22, limbTopX, limbTopY);
        ctx.moveTo(railMx, railMy);
        ctx.quadraticCurveTo(railMx + w * 0.1, railMy + h * 0.2, limbBotX, limbBotY);
        ctx.stroke();
        ACG.px(ctx, limbTopX - 1, limbTopY - 1, 2, 2, theme.brass500); // tip caps
        ACG.px(ctx, limbBotX - 1, limbBotY - 1, 2, 2, theme.brass500);
        // String: limb tip to limb tip, drawn back to the trigger claw.
        var nockX = railBx + w * 0.3, nockY = railBy - (railBy - railMy) * 0.3 - 2;
        ACG.glow(ctx, theme.cyan600, 6, function () {
          ctx.strokeStyle = theme.cyan500;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(limbTopX, limbTopY);
          ctx.lineTo(nockX, nockY);
          ctx.lineTo(limbBotX, limbBotY);
          ctx.stroke();
        });
        // Bolt seated on the rail: brass shaft, glowing head past the limbs.
        ctx.strokeStyle = theme.brass500;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(nockX, nockY);
        ctx.lineTo(railMx + w * 0.06, railMy - 2 - (0));
        ctx.stroke();
        ACG.glow(ctx, theme.cyan500, 5, function () {
          ctx.fillStyle = theme.cyan400;
          ctx.beginPath();
          ctx.moveTo(railMx + w * 0.06, railMy - 4);
          ctx.lineTo(railMx + w * 0.14, railMy - 2);
          ctx.lineTo(railMx + w * 0.06, railMy);
          ctx.closePath();
          ctx.fill();
        });
        break;
      }
      case 'shield-dome': {
        // Brass emitter housing under a latticed cyan dome.
        ACG.plate(ctx, left + w * 0.3, s.y - h * 0.28, w * 0.4, h * 0.28, theme.stone700, theme.brass600, shade);
        ACG.rivets(ctx, left + w * 0.3, s.y - h * 0.27, w * 0.4, theme.brass400, 3);
        ACG.px(ctx, s.x - 2, s.y - h * 0.28 - 3, 4, 3, theme.brass500); // emitter tip
        var dr = w * 0.45, dcy = s.y - h * 0.28;
        ACG.glow(ctx, theme.cyan600, 14, function () {
          ctx.strokeStyle = theme.cyan500;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(s.x, dcy, dr, Math.PI, 0);
          ctx.stroke();
          // Lattice: two inner ribs + meridian.
          ctx.lineWidth = 1;
          ctx.globalAlpha = 0.6;
          ctx.beginPath();
          ctx.arc(s.x, dcy, dr * 0.66, Math.PI, 0);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(s.x, dcy - dr);
          ctx.lineTo(s.x, dcy);
          ctx.stroke();
          ctx.globalAlpha = 1;
        });
        break;
      }
      case 'aether-radar': {
        // Stone spire with twin brass dishes and a cyan ping.
        ACG.masonry(ctx, s.x - w * 0.16, top + h * 0.24, w * 0.32, h * 0.76, theme.stone700, theme.stone500, shade);
        ACG.crenels(ctx, s.x - w * 0.16, top + h * 0.24, w * 0.32, 2, 2.5, theme.stone700, theme.stone500, shade, null);
        // Mast.
        ACG.px(ctx, s.x - 1, top + h * 0.06, 2, h * 0.2, theme.brass600);
        // Dishes: brass arcs facing outward.
        ctx.strokeStyle = theme.brass500;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(s.x - w * 0.3, top + h * 0.16, w * 0.18, Math.PI * 0.6, Math.PI * 1.5);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(s.x + w * 0.3, top + h * 0.16, w * 0.18, Math.PI * 1.5, Math.PI * 0.4);
        ctx.stroke();
        // Ping arc.
        ACG.glow(ctx, theme.cyan600, 10, function () {
          ctx.strokeStyle = theme.cyan400;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(s.x, top + h * 0.1, w * 0.42, Math.PI * 1.15, Math.PI * 1.85);
          ctx.stroke();
          ACG.px(ctx, s.x - 1, top + h * 0.08, 2, 2, theme.cyan400);
        });
        break;
      }
      case 'repair-bay': {
        // Riveted gantry frame over a work pit, acid-green service cross,
        // hanging chain hoist.
        ACG.plate(ctx, left, s.y - h * 0.3, w, h * 0.3, theme.stone700, theme.brass600, shade);
        ACG.dither(ctx, left, s.y - h * 0.3, w, h * 0.3, theme.stone800, 0.15, 2, 7);
        // Gantry posts + beam.
        ACG.px(ctx, left + w * 0.08, top, 3, h * 0.7, theme.brass600);
        ACG.px(ctx, left + w * 0.86, top, 3, h * 0.7, theme.brass600);
        ACG.px(ctx, left + w * 0.08, top, w * 0.81, 3, theme.brass500);
        ACG.rivets(ctx, left + w * 0.08, top + 1, w * 0.81, theme.brass300, 5);
        // Chain hoist.
        ctx.strokeStyle = theme.stone500;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(left + w * 0.3, top + 3);
        ctx.lineTo(left + w * 0.3, top + h * 0.34);
        ctx.stroke();
        ACG.px(ctx, left + w * 0.28, top + h * 0.34, 4, 3, theme.brass600); // hook block
        // Service cross.
        ACG.glow(ctx, theme.acid500, 10, function () {
          ACG.px(ctx, left + w * 0.52, top + h * 0.2, w * 0.24, 3, theme.acid400);
          ACG.px(ctx, left + w * 0.62, top + h * 0.08, 3, h * 0.31, theme.acid400);
        });
        break;
      }
      case 'missile-silo': {
        // Crenellated launch tower with an aether-strike missile nosing out.
        ACG.plate(ctx, left, s.y - h * 0.35, w, h * 0.35, stone, lit, shade);
        ACG.masonry(ctx, s.x - w * 0.26, top + h * 0.2, w * 0.52, h * 0.48, theme.stone700, theme.stone500, shade);
        ACG.crenels(ctx, s.x - w * 0.26, top + h * 0.2, w * 0.52, 2.5, 3, theme.stone700, theme.stone500, shade, neon);
        // Missile: violet-striped body, magenta nose cone, cyan fin lights.
        var mw2 = w * 0.16;
        ACG.px(ctx, s.x - mw2 / 2, top + h * 0.06, mw2, h * 0.3, theme.stone300);
        ACG.px(ctx, s.x - mw2 / 2, top + h * 0.14, mw2, 2, theme.violet500);
        ACG.px(ctx, s.x - mw2 / 2, top + h * 0.24, mw2, 2, theme.violet500);
        ACG.glow(ctx, theme.magenta600, 8, function () {
          ctx.fillStyle = theme.magenta500;
          ctx.beginPath();
          ctx.moveTo(s.x - mw2 / 2, top + h * 0.06);
          ctx.lineTo(s.x + mw2 / 2, top + h * 0.06);
          ctx.lineTo(s.x, top - h * 0.04);
          ctx.closePath();
          ctx.fill();
        });
        ACG.glow(ctx, theme.cyan500, 4, function () {
          ACG.px(ctx, s.x - mw2 / 2 - 1, top + h * 0.32, 1, 3, theme.cyan400);
          ACG.px(ctx, s.x + mw2 / 2, top + h * 0.32, 1, 3, theme.cyan400);
        });
        break;
      }
      default:
        ACG.masonry(ctx, left, top, w, h, stone, lit, shade);
    }

    // Owner banner: slot-coloured pennant on a tiny brass pole.
    if (ownerColour) {
      ACG.px(ctx, s.x - 1, top - 8, 1, 8, theme.brass600);
      ctx.fillStyle = ownerColour;
      ctx.beginPath();
      ctx.moveTo(s.x, top - 8);
      ctx.lineTo(s.x + 6, top - 6.5);
      ctx.lineTo(s.x, top - 5);
      ctx.closePath();
      ctx.fill();
    }

    // Damage readout, only once something has actually hit it.
    if (frac < 1) {
      var barW = Math.max(16, w * 0.7);
      var barX = s.x - barW / 2;
      var barY = top - 12;
      ACG.px(ctx, barX - 1, barY - 1, barW + 2, 5, theme.void900);
      ctx.fillStyle = frac > 0.6 ? theme.hpFull : (frac > 0.3 ? theme.hpMid : theme.hpLow);
      ctx.fillRect(barX, barY, barW * frac, 3);
    }

    ctx.restore();
  }

  var API = { drawStructureAC: drawStructureAC, drawRubbleAC: drawRubbleAC, drawFoundationAC: drawFoundationAC };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = API;
  } else {
    window.ACStructures = API;
  }
})();
