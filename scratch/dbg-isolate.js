// Is the divergence caused by structures, or does the same shot diverge
// without them? Runs the identical Nuke twice: once with the holding cleared
// on both clients, once with it intact.
const {
  until, hashTerrain, tanksOf, structuresOf, gameOf, startTestServer, setupMatch
} = require('../tests/helpers/browser-harness.js');

async function trial(srv, clearStructures) {
  const { host, guest } = await setupMatch(srv.port, 1);
  const H = () => gameOf(host), G = () => gameOf(guest);

  if (clearStructures) { H().structures = []; G().structures = []; }

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

  console.log(`[structures ${clearStructures ? 'CLEARED' : 'INTACT '}] ` +
    `terrainDivergedAtTick=${divergedAt} differingCols=${nDiff} ` +
    `tanksEqual=${tanksOf(H()) === tanksOf(G())} ` +
    `structsEqual=${structuresOf(H()) === structuresOf(G())}`);

  host.close(); guest.close();
}

(async () => {
  const srv = await startTestServer();
  await trial(srv, true);
  await trial(srv, false);
  srv.close();
  process.exit(0);
})();
