// Minimal two-client Nuke repro using ONLY pre-existing harness exports, so it
// can be run against HEAD with my changes stashed. Repeats the trial N times
// and reports how often the two clients disagree about the terrain.
const {
  until, hashTerrain, tanksOf, gameOf, startTestServer, setupMatch
} = require('../tests/helpers/browser-harness.js');

const TRIALS = Number(process.argv[2] || 5);

async function trial(srv) {
  const { host, guest } = await setupMatch(srv.port, 1);
  const H = () => gameOf(host), G = () => gameOf(guest);

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

  const a = H().terrain.heights, b = G().terrain.heights;
  let nDiff = 0;
  for (let c = 0; c < a.length; c++) if (a[c] !== b[c]) nDiff++;
  const tanksEqual = tanksOf(H()) === tanksOf(G());

  host.close(); guest.close();
  return { divergedAt, nDiff, tanksEqual };
}

(async () => {
  const srv = await startTestServer();
  let bad = 0;
  for (let i = 0; i < TRIALS; i++) {
    const r = await trial(srv);
    if (r.nDiff > 0) bad++;
    console.log(`RESULT trial=${i} divergedAtTick=${r.divergedAt} differingCols=${r.nDiff} tanksEqual=${r.tanksEqual}`);
  }
  console.log(`SUMMARY ${bad}/${TRIALS} trials desynced`);
  srv.close();
  process.exit(0);
})();
