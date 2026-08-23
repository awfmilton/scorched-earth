const { bootBrowser, startTestServer, until } = require('../tests/helpers/browser-harness.js');
(async () => {
  const srv = await startTestServer();
  const b = bootBrowser(srv.port);
  await until(() => b.ctx.globalThis.SCORCHED && b.ctx.globalThis.SCORCHED.gameInstance, 10000, 'g');
  b.el('btn-solo').click(); b.el('btn-start-solo').click();
  const game = b.ctx.globalThis.SCORCHED.gameInstance;
  const t = game.roster[1];
  game.roster[2].hp = 0;
  game.activePlayerIdx = 0;
  t.hp = 1;
  console.log('target x=%s y=%s shield=%j', t.x.toFixed(1), t.y.toFixed(1), t.shield);
  game.projectiles = [{ x: t.x, y: t.y - 10, vx: 0, vy: 60, weapon: 'Baby Missile', shooterIdx: 0, trigger: null }];
  for (let i = 0; i < 60 && game.projectiles.length > 0; i++) {
    const p = game.projectiles[0];
    if (i % 5 === 0) console.log(' step %d proj y=%s (band %s..%s)', i, p.y.toFixed(2), (t.y-6).toFixed(2), t.y.toFixed(2));
    game.update(1/60);
  }
  console.log('after: projectiles=%d targetHp=%s roundOver=%s', game.projectiles.length, t.hp, game.roundOver);
  srv.close(); process.exit(0);
})();
