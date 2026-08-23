const { bootBrowser, startTestServer, until } = require('../tests/helpers/browser-harness.js');
(async () => {
  const srv = await startTestServer();
  const b = bootBrowser(srv.port);
  await until(() => b.ctx.globalThis.SCORCHED && b.ctx.globalThis.SCORCHED.gameInstance, 10000, 'g');
  b.el('btn-solo').click(); b.el('btn-start-solo').click();
  const game = b.ctx.globalThis.SCORCHED.gameInstance;
  console.log('roundState=%j gravity=%s headless=%s roundOver=%s mode=%s',
    game.roundState, game.gravity, game.headless, game.roundOver, game.mode);
  const t = game.roster[1];
  game.projectiles = [{ x: t.x, y: t.y - 10, vx: 0, vy: 60, weapon: 'Baby Missile', shooterIdx: 0, trigger: null }];
  console.log('before stepPhysics: y=%s ticks=%s', game.projectiles[0].y.toFixed(2), game.roundState && game.roundState.ticks);
  game.stepPhysics(1/60);
  console.log('after  stepPhysics: n=%d y=%s ticks=%s flightTicks=%s',
    game.projectiles.length,
    game.projectiles[0] ? game.projectiles[0].y.toFixed(2) : 'gone',
    game.roundState && game.roundState.ticks,
    game.projectiles[0] && game.projectiles[0].flightTicks);
  // Now via update()
  game.update(1/60);
  console.log('after  update():   n=%d y=%s ticks=%s',
    game.projectiles.length,
    game.projectiles[0] ? game.projectiles[0].y.toFixed(2) : 'gone',
    game.roundState && game.roundState.ticks);
  srv.close(); process.exit(0);
})();
