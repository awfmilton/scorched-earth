// Compare the two clients' projectile state at the instant both have one, and
// again at the first tick their terrain disagrees.
const {
  until, hashTerrain, tanksOf, gameOf, startTestServer, setupMatch
} = require('../tests/helpers/browser-harness.js');

const dump = (g) => {
  const p = g.projectile || (g.projectiles && g.projectiles[0]);
  if (!p) return 'none';
  return `x=${p.x} y=${p.y} vx=${p.vx} vy=${p.vy} w=${p.weapon} n=${g.projectiles.length}`;
};

(async () => {
  const srv = await startTestServer();
  const { host, guest } = await setupMatch(srv.port, 1);
  const H = () => gameOf(host), G = () => gameOf(guest);

  console.log('tanks equal at start:', tanksOf(H()) === tanksOf(G()));
  console.log('wind host/guest:', H().wind, G().wind);

  const activeSlot = H().roster[H().activePlayerIdx].slot;
  const shooter = (H().mySlot === activeSlot) ? host : guest;
  console.log('shooter is', shooter === host ? 'HOST' : 'GUEST');
  const sg = gameOf(shooter);
  const aim = sg.roster[sg.activePlayerIdx];
  aim.angle = 80; aim.power = 400;
  aim.selectedWeapon = 'Nuke'; aim.inventory['Nuke'] = 5;

  shooter.dom.window.dispatch('keydown', { key: ' ', code: 'Space' });
  await until(() => H().projectile && G().projectile, 10000, 'shot');

  console.log('HOST  proj:', dump(H()));
  console.log('GUEST proj:', dump(G()));
  console.log('wind after fire host/guest:', H().wind, G().wind);
  console.log('tanks equal after fire:', tanksOf(H()) === tanksOf(G()));

  const TICK = host.ctx.globalThis.SCORCHED.CONST.TICK;
  for (let i = 0; i < 1200; i++) {
    const before = hashTerrain(H()) === hashTerrain(G());
    H().stepPhysics(TICK);
    G().stepPhysics(TICK);
    const after = hashTerrain(H()) === hashTerrain(G());
    if (before && !after) {
      console.log(`--- diverged at tick ${i} ---`);
      console.log('HOST  proj:', dump(H()));
      console.log('GUEST proj:', dump(G()));
      break;
    }
    if (!H().projectile && !G().projectile) { console.log('both resolved, no divergence'); break; }
  }

  host.close(); guest.close(); srv.close();
  process.exit(0);
})();
