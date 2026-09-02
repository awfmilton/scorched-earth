/**
 * Æthercastle vehicle chassis sprites (gfx/ac-chassis.js)
 *
 * Drop-in replacement body for drawTank()'s Aethercastle branch. One sprite
 * per locomotion/chassis id, styled after the concept sheets: brass-and-cog
 * clockwork hulls, riveted plate, aether piping in the owner's slot colour,
 * neon only where something is alchemically powered.
 *
 * drawTankAC(ctx, tank, chassis, isActive, theme)
 *   tank    — live roster entry (x, y, angle, color)
 *   chassis — CHASSIS[id] client entry (hullW, hullH, accent, locomotion, id)
 *
 * ── MUZZLE CONTRACT (do not move) ──────────────────────────────────────
 * The barrel is anchored at (x, y - 6) and is 12 long. The simulation
 * spawns shells there (fire() / applyFireSync). All chassis character
 * lives in the hull, running gear and accents — never the barrel.
 *
 * Draw-only, deterministic. Rolling-gear animation keys off tank.x (a
 * replicated value), never a clock. Classic mode keeps its own sprite.
 */
(function () {
  'use strict';
  var ACG = (typeof module !== 'undefined' && module.exports)
    ? require('./ac-common.js')
    : window.ACG;

  function drawTankAC(ctx, tank, chassis, isActive, theme) {
    var hw = chassis.hullW, hh = chassis.hullH;
    var accent = chassis.accent;
    var left = tank.x - hw / 2;
    var hullTop = tank.y - hh;
    var body = tank.color;
    var bodyLit = ACG.tint(body, 0.35);
    var bodyDark = ACG.shade(body, 0.45);

    ctx.save();
    switch (chassis.id) {
      case 'walker-mech': {
        // Tall copper walker from the concept sheets: hull carried high on
        // long jointed legs — shoulder, out-flung knee, shin, foot pad —
        // with piston lines and a cyan sensor eye.
        var hy = hullTop - 5; // hull rides high; dome/barrel stay on contract
        var shL = { x: tank.x - hw * 0.42, y: hy + 2 };
        var shR = { x: tank.x + hw * 0.42, y: hy + 2 };
        var kneeL = { x: tank.x - hw * 0.78, y: tank.y - 4 };
        var kneeR = { x: tank.x + hw * 0.78, y: tank.y - 4 };
        var footL = { x: tank.x - hw * 0.55, y: tank.y };
        var footR = { x: tank.x + hw * 0.55, y: tank.y };
        ctx.strokeStyle = theme.stone500;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(shL.x, shL.y); ctx.lineTo(kneeL.x, kneeL.y); ctx.lineTo(footL.x, footL.y);
        ctx.moveTo(shR.x, shR.y); ctx.lineTo(kneeR.x, kneeR.y); ctx.lineTo(footR.x, footR.y);
        ctx.stroke();
        // Piston rods inside the thighs.
        ctx.strokeStyle = accent;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(shL.x - 1, shL.y + 2); ctx.lineTo(kneeL.x + 1, kneeL.y - 1);
        ctx.moveTo(shR.x + 1, shR.y + 2); ctx.lineTo(kneeR.x - 1, kneeR.y - 1);
        ctx.stroke();
        // Joints and feet.
        ACG.px(ctx, shL.x - 1, shL.y - 1, 2, 2, accent);
        ACG.px(ctx, shR.x - 1, shR.y - 1, 2, 2, accent);
        ACG.px(ctx, kneeL.x - 1, kneeL.y - 1, 2, 2, accent);
        ACG.px(ctx, kneeR.x - 1, kneeR.y - 1, 2, 2, accent);
        ACG.px(ctx, footL.x - 2, tank.y - 1, 5, 2, theme.stone700);
        ACG.px(ctx, footR.x - 2, tank.y - 1, 5, 2, theme.stone700);
        ACG.px(ctx, footL.x - 2, tank.y - 1, 5, 1, theme.stone500);
        ACG.px(ctx, footR.x - 2, tank.y - 1, 5, 1, theme.stone500);
        // Hull: riveted plate with vents and sensor eye.
        ACG.plate(ctx, left, hy, hw, hh, body, bodyLit, theme.void900);
        ACG.rivets(ctx, left, hy + 1, hw, bodyDark, 3);
        ACG.px(ctx, left + 2, hy + hh - 3, 3, 1, bodyDark);
        ACG.px(ctx, left + 2, hy + hh - 5, 3, 1, bodyDark);
        // Signature aether piping along the hull top.
        ACG.glow(ctx, theme.magenta600, 4, function () {
          ACG.px(ctx, left + 2, hy, hw - 6, 1, theme.magenta500);
        });
        // Chin gimbal joining hull to the turret ring below.
        ACG.px(ctx, tank.x - 2, hy + hh, 4, 2, theme.stone700);
        ACG.glow(ctx, theme.cyan500, 5, function () {
          ACG.px(ctx, left + hw - 4, hy + 2, 2, 2, theme.cyan400);
        });
        break;
      }
      case 'airship-platform': {
        // Brass-ribbed envelope over a slung gondola; running lights.
        var ey = tank.y - hh - 3;
        var rx = hw / 2, ry = hh * 0.7;
        ctx.fillStyle = body;
        ctx.beginPath();
        ctx.ellipse(tank.x, ey, rx, ry, 0, 0, Math.PI * 2);
        ctx.fill();
        // Rib lines + top highlight, clipped to the envelope.
        ctx.save();
        ctx.clip();
        ACG.px(ctx, tank.x - rx, ey - ry, hw, 2, bodyLit);
        ctx.fillStyle = bodyDark;
        for (var rib = -2; rib <= 2; rib++) {
          ctx.fillRect(tank.x + rib * (rx / 2.6), ey - ry, 1, ry * 2);
        }
        ACG.px(ctx, tank.x - rx, ey + ry - 2, hw, 2, bodyDark);
        ctx.restore();
        // Brass nose cap and tail fin.
        ACG.px(ctx, tank.x + rx - 2, ey - 2, 3, 4, accent);
        ACG.px(ctx, tank.x - rx - 2, ey - 4, 3, 8, ACG.shade(accent, 0.2));
        // Rigging.
        ctx.strokeStyle = theme.stone500;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(tank.x - 4, ey + ry); ctx.lineTo(tank.x - 3, tank.y - 6);
        ctx.moveTo(tank.x + 4, ey + ry); ctx.lineTo(tank.x + 3, tank.y - 6);
        ctx.stroke();
        // Gondola: riveted brass car.
        ACG.plate(ctx, tank.x - hw * 0.22, tank.y - 6, hw * 0.44, 5, theme.stone700, accent, theme.void900);
        ACG.rivets(ctx, tank.x - hw * 0.22, tank.y - 5, hw * 0.44, accent, 3);
        // Running lights: magenta fore, cyan aft.
        ACG.glow(ctx, theme.magenta500, 4, function () {
          ACG.px(ctx, tank.x + rx - 1, ey, 1, 1, theme.magenta500);
        });
        ACG.glow(ctx, theme.cyan500, 4, function () {
          ACG.px(ctx, tank.x - rx, ey, 1, 1, theme.cyan400);
        });
        break;
      }
      case 'scout-drone': {
        // The concept-sheet quad drone: brass X-frame, four rotor rings
        // (near pair bright, far pair dimmed behind), a glowing
        // fusion-bottle core, landing skids. Reads as a flying machine.
        var podW2 = 6, podTop2 = tank.y - 5;
        var hubY = tank.y - 10;
        // X-frame arms from the pod up-and-out to the four hubs.
        ctx.strokeStyle = theme.brass600;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(tank.x - 2, podTop2 + 1); ctx.lineTo(tank.x - hw * 0.5, hubY + 1);
        ctx.moveTo(tank.x + 2, podTop2 + 1); ctx.lineTo(tank.x + hw * 0.5, hubY + 1);
        ctx.moveTo(tank.x - 1, podTop2 + 1); ctx.lineTo(tank.x - hw * 0.25, hubY);
        ctx.moveTo(tank.x + 1, podTop2 + 1); ctx.lineTo(tank.x + hw * 0.25, hubY);
        ctx.stroke();
        // Far rotor pair: dimmed rings behind.
        var dimRing = ACG.shade(theme.brass600, 0.25);
        ctx.strokeStyle = dimRing;
        ctx.beginPath(); ctx.ellipse(tank.x - hw * 0.25, hubY - 1, 3, 1.5, 0, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.ellipse(tank.x + hw * 0.25, hubY - 1, 3, 1.5, 0, 0, Math.PI * 2); ctx.stroke();
        // Near rotor pair: brass rings with a cyan blade shimmer whose
        // phase keys off tank.x (replicated), so flight reads as spin.
        var spin2 = (Math.floor(tank.x) % 3) - 1;
        ctx.strokeStyle = theme.brass500;
        ctx.beginPath(); ctx.ellipse(tank.x - hw * 0.5, hubY, 4, 2, 0, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.ellipse(tank.x + hw * 0.5, hubY, 4, 2, 0, 0, Math.PI * 2); ctx.stroke();
        ACG.glow(ctx, theme.cyan500, 5, function () {
          ACG.px(ctx, tank.x - hw * 0.5 - 3 + spin2, hubY, 6, 1, theme.cyan400);
          ACG.px(ctx, tank.x + hw * 0.5 - 3 - spin2, hubY, 6, 1, theme.cyan400);
        });
        ACG.px(ctx, tank.x - hw * 0.5 - 1, hubY - 1, 2, 2, theme.stone700); // hubs
        ACG.px(ctx, tank.x + hw * 0.5 - 1, hubY - 1, 2, 2, theme.stone700);
        // Pod: brass shell around the glowing fusion bottle.
        ACG.plate(ctx, tank.x - podW2 / 2, podTop2, podW2, 4, body, bodyLit, theme.void900);
        ACG.glow(ctx, theme.cyan500, 6, function () {
          ACG.px(ctx, tank.x - 1, podTop2 + 1, 2, 2, theme.cyan400);
        });
        ACG.px(ctx, tank.x - 1, podTop2 - 1, 2, 1, theme.brass500); // bottle cork
        // Landing skids.
        ctx.strokeStyle = theme.stone500;
        ctx.beginPath();
        ctx.moveTo(tank.x - 2, podTop2 + 4); ctx.lineTo(tank.x - 3, tank.y);
        ctx.moveTo(tank.x + 2, podTop2 + 4); ctx.lineTo(tank.x + 3, tank.y);
        ctx.stroke();
        ACG.px(ctx, tank.x - 4, tank.y - 1, 3, 1, theme.stone500);
        ACG.px(ctx, tank.x + 2, tank.y - 1, 3, 1, theme.stone500);
        // Hover wash below.
        ACG.glow(ctx, accent, 8, function () {
          ACG.px(ctx, tank.x - 3, tank.y + 1, 6, 1, accent);
        });
        break;
      }
      case 'brass-plated-tank': {
        // Heavy twin-course armour, dense rivets, violet vision slit.
        drawTracks(ctx, tank, left, hw, theme, accent, 4);
        ACG.plate(ctx, left, hullTop, hw, Math.ceil(hh / 2), body, bodyLit, bodyDark);
        ACG.plate(ctx, left + 1, hullTop + Math.ceil(hh / 2), hw - 2, Math.floor(hh / 2) - 2, ACG.shade(body, 0.15), body, theme.void900);
        ACG.rivets(ctx, left, hullTop + 1, hw, accent, 3);
        ACG.rivets(ctx, left + 1, hullTop + Math.ceil(hh / 2) + 1, hw - 2, accent, 3);
        // Brass prow wedge and armoured exhaust stack.
        ACG.px(ctx, left + hw - 2, hullTop + 1, 2, hh - 4, accent);
        ACG.px(ctx, left + 1, hullTop - 3, 3, 3, theme.stone700);
        ACG.px(ctx, left + 1, hullTop - 4, 3, 1, accent);
        // Bolted plate seams down the hull.
        ACG.px(ctx, left + Math.floor(hw * 0.35), hullTop + 1, 1, hh - 3, bodyDark);
        ACG.px(ctx, left + Math.floor(hw * 0.65), hullTop + 1, 1, hh - 3, bodyDark);
        // Signature aether piping along the hull top.
        ACG.glow(ctx, theme.magenta600, 4, function () {
          ACG.px(ctx, left + 5, hullTop, hw - 8, 1, theme.magenta500);
        });
        ACG.glow(ctx, theme.violet500, 4, function () {
          ACG.px(ctx, left + 3, hullTop + 2, 4, 1, theme.violet500);
        });
        break;
      }
      case 'aether-field-tank': {
        // Thin hull, magenta reactor window, emitter pylons, faint field.
        drawTracks(ctx, tank, left, hw, theme, accent, 3);
        ACG.plate(ctx, left, hullTop, hw, hh, body, bodyLit, theme.void900);
        ACG.rivets(ctx, left, hullTop + 1, hw, bodyDark, 4);
        ACG.glow(ctx, theme.magenta600, 7, function () {
          ACG.px(ctx, left + 2, hullTop + 2, 4, 2, theme.magenta500);
        });
        // Emitter pylons on the hull corners.
        ACG.px(ctx, left, hullTop - 2, 1, 2, theme.stone500);
        ACG.px(ctx, left + hw - 1, hullTop - 2, 1, 2, theme.stone500);
        ACG.glow(ctx, theme.magenta500, 4, function () {
          ACG.px(ctx, left, hullTop - 3, 1, 1, theme.magenta400);
          ACG.px(ctx, left + hw - 1, hullTop - 3, 1, 1, theme.magenta400);
        });
        // The field itself: a faint magenta dome between the pylons.
        ctx.save();
        ctx.globalAlpha = 0.3;
        ctx.strokeStyle = theme.magenta500;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(tank.x, tank.y - 4, hw * 0.62, Math.PI, 0);
        ctx.stroke();
        ctx.restore();
        break;
      }
      case 'clockwork-tank':
      default: {
        // The signature hull: cog-toothed wheels, riveted plate, brass
        // clock face, magenta aether pipe, chuffing exhaust stack.
        drawTracks(ctx, tank, left, hw, theme, accent, 3);
        ACG.plate(ctx, left, hullTop, hw, hh, body, bodyLit, theme.void900);
        ACG.rivets(ctx, left, hullTop + 1, hw, bodyDark, 3);
        // Clock face: brass disc, void hands.
        ACG.px(ctx, left + 2, hullTop + 1, 4, 4, accent);
        ACG.px(ctx, left + 3, hullTop + 2, 2, 2, ACG.tint(accent, 0.4));
        ACG.px(ctx, left + 4, hullTop + 2, 1, 2, theme.void900);
        // Aether pipe along the hull top.
        ACG.glow(ctx, theme.magenta600, 4, function () {
          ACG.px(ctx, left + 7, hullTop, hw - 9, 1, theme.magenta500);
        });
        // Exhaust stack at the rear.
        ACG.px(ctx, left + hw - 3, hullTop - 3, 2, 3, theme.stone700);
        ACG.px(ctx, left + hw - 3, hullTop - 4, 2, 1, ACG.shade(theme.stone700, 0.3));
        break;
      }
    }

    // ── Turret dome + barrel: the muzzle contract ──────────────────────
    var angleRad = (tank.angle * Math.PI) / 180;
    // ACG.cos/sin, not Math's: the host hands the kit the same deterministic
    // pair the simulation spawns shells with, so the drawn muzzle and the real
    // one are the same number on every client.
    var bx = tank.x + 12 * ACG.cos(angleRad);
    var by = tank.y - 6 - 12 * ACG.sin(angleRad);
    // Dome: body colour with a lit crown pixel row.
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.arc(tank.x, tank.y - 6, 4, Math.PI, 0);
    ctx.fill();
    ACG.px(ctx, tank.x - 2, tank.y - 9, 4, 1, bodyLit);
    // Barrel: accent sleeve with a dark core line and a glowing muzzle tip.
    ctx.strokeStyle = accent;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(tank.x, tank.y - 6);
    ctx.lineTo(bx, by);
    ctx.stroke();
    ctx.strokeStyle = ACG.shade(accent, 0.35);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(tank.x, tank.y - 6);
    ctx.lineTo(bx, by);
    ctx.stroke();
    ACG.glow(ctx, theme.magenta500, 3, function () {
      ACG.px(ctx, bx - 1, by - 1, 2, 2, theme.magenta400);
    });
    ctx.restore();

    if (isActive) {
      // Active marker: brass gonfalon chevron instead of a flat triangle.
      ctx.fillStyle = theme.fx.activeMarker;
      ctx.beginPath();
      ctx.moveTo(tank.x - 4, tank.y - 21);
      ctx.lineTo(tank.x + 4, tank.y - 21);
      ctx.lineTo(tank.x + 4, tank.y - 17);
      ctx.lineTo(tank.x, tank.y - 14);
      ctx.lineTo(tank.x - 4, tank.y - 17);
      ctx.closePath();
      ctx.fill();
      ACG.px(ctx, tank.x - 4, tank.y - 21, 8, 1, ACG.tint(theme.fx.activeMarker, 0.4));
    }
  }

  // Shared tracked running gear: dark band, cog wheels with tooth pixels,
  // rolling phase keyed off tank.x so driving reads as motion.
  function drawTracks(ctx, tank, left, hw, theme, accent, wheels) {
    ACG.px(ctx, left - 1, tank.y - 3, hw + 2, 3, theme.stone700);
    ACG.px(ctx, left - 1, tank.y - 3, hw + 2, 1, theme.stone500); // top run
    var phase = Math.floor(tank.x) % 2;
    for (var w = 0; w < wheels; w++) {
      var wx = left + 1 + w * ((hw - 3) / (wheels - 1));
      ACG.px(ctx, wx, tank.y - 2, 2, 2, accent);
      // A tooth pixel that alternates with travel: the cog "turns".
      ACG.px(ctx, wx + ((w + phase) % 2), tank.y - 3, 1, 1, ACG.tint(accent, 0.3));
    }
  }

  var API = { drawTankAC: drawTankAC };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = API;
  } else {
    window.ACChassis = API;
  }
})();
