// Focused repro: fire one Nuke through the real net path and compare the two
// clients column by column, to find WHAT diverges rather than that it does.
const {
  until, hashTerrain, tanksOf, structuresOf, gameOf, startTestServer, setupMatch
} = require('../tests/helpers/browser-harness.js');

(async () => {
  const srv = await startTestServer();
  const { host, guest } = await setupMatch(srv.port, 1);
  const H = () => gameOf(host), G = () => gameOf(guest);

  console.log('structures equal at start:', structuresOf(H()) === structuresOf(G()));
  console.log('terrain equal at start   :', hashTerrain(H()) === hashTerrain(G()));
  console.log('n structures:', H().structures.length);

  const activeSlot = H().roster[H().activePlayerIdx].slot;
  const shooter = (H().mySlot === activeSlot) ? host : guest;
  const sg = gameOf(shooter);
  const aim = sg.roster[sg.activePlayerIdx];
  aim.angle = 80; aim.power = 400;
  aim.selectedWeapon = 'Nuke'; aim.inventory['Nuke'] = 5;

  shooter.dom.window.dispatch('keydown', { key: ' ', code: 'Space' });
  await until(() => H().projectile && G().projectile, 10000, 'shot');

  const TICK = host.ctx.globalThis.SCORCHED.CONST.TICK;
  let divergedAt = -1;
  for (let i = 0; i < 1200; i++) {
    H().stepPhysics(TICK);
    G().stepPhysics(TICK);
    if (divergedAt < 0 && hashTerrain(H()) !== hashTerrain(G())) divergedAt = i;
    if (!H().projectile && !G().projectile) break;
  }
  console.log('terrain first diverged at tick:', divergedAt);
  console.log('structures equal after shot:', structuresOf(H()) === structuresOf(G()));
  console.log('tanks equal after shot     :', tanksOf(H()) === tanksOf(G()));

  // Where exactly does the heightmap differ?
  const a = H().terrain.heights, b = G().terrain.heights;
  const diffs = [];
  for (let c = 0; c < a.length; c++) if (a[c] !== b[c]) diffs.push(c);
  console.log('differing columns:', diffs.length, diffs.slice(0, 12));
  if (diffs.length) {
    const c = diffs[0];
    console.log(`col ${c}: host=${a[c]} guest=${b[c]}`);
  }

  // And the holdings, side by side where they differ.
  const hs = H().structures, gs = G().structures;
  for (let i = 0; i < hs.length; i++) {
    if (hs[i].hp !== gs[i].hp || hs[i].x !== gs[i].x || hs[i].y !== gs[i].y) {
      console.log(`struct ${i} ${hs[i].key}: host hp=${hs[i].hp} y=${hs[i].y} | guest hp=${gs[i].hp} y=${gs[i].y}`);
    }
  }
  console.log('host turn', H().turnNumber, 'guest turn', G().turnNumber);

  // Now let the turn boundary land on BOTH and re-compare. If the holdings
  // converge here, the divergence above was delivery order, not simulation.
  try {
    await until(
      () => H().turnNumber !== undefined && G().turnNumber !== undefined
         && H().turnNumber === G().turnNumber,
      10000, 'both clients to receive TURN_SYNC'
    );
  } catch (e) { console.log('WAIT FAILED:', e.message); }
  console.log('--- after both processed TURN_SYNC ---');
  console.log('host turn', H().turnNumber, 'guest turn', G().turnNumber);
  console.log('structures equal:', structuresOf(H()) === structuresOf(G()));
  console.log('terrain equal   :', hashTerrain(H()) === hashTerrain(G()));
  console.log('tanks equal     :', tanksOf(H()) === tanksOf(G()));
  const hs2 = H().structures, gs2 = G().structures;
  for (let i = 0; i < hs2.length; i++) {
    if (hs2[i].hp !== gs2[i].hp) {
      console.log(`STILL DIFF struct ${i} ${hs2[i].key}: host=${hs2[i].hp} guest=${gs2[i].hp}`);
    }
  }

  host.close(); guest.close(); srv.close();
  process.exit(0);
})();
