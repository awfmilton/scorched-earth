const { bootBrowser, until, startTestServer } = require('../tests/helpers/browser-harness.js');
const gameOf = (b) => b.ctx.globalThis.SCORCHED.gameInstance;

(async () => {
  const srv = await startTestServer();
  const port = srv.port;
  const host = bootBrowser(port), guest = bootBrowser(port);
  await until(() => gameOf(host), 5000, 'host game');
  await until(() => gameOf(guest), 5000, 'guest game');
  host.el('btn-create-match').click();
  await until(() => (host.el('display-share-code').textContent || '').trim().length === 4, 5000, 'code');
  guest.el('join-code').value = host.el('display-share-code').textContent.trim();
  guest.el('btn-join-match').click();
  await until(() => host.el('multiplayer-slots').children.length >= 2, 5000, 'lobby');
  host.el('rounds').value = '2';
  host.el('starting-cash').value = '10000';
  host.el('wall-type').value = 'off';
  host.el('start-btn').click();
  await until(() => gameOf(host).roster && gameOf(host).roster.length === 2, 5000, 'round start');
  await until(() => gameOf(guest).roster && gameOf(guest).roster.length === 2, 5000, 'guest round start');

  const g = gameOf(host);
  console.log('config =', JSON.stringify(g.config));
  console.log('availableWeapons len =', typeof g.availableWeapons === 'function' ? g.availableWeapons().length : 'NO METHOD');
  console.log('WEAPONS len =', host.ctx.globalThis.SCORCHED.WEAPONS.length);

  const activeSlot = g.roster[g.activePlayerIdx].slot;
  const shooter = g.mySlot === activeSlot ? host : guest;
  const sg = gameOf(shooter);
  const aim = sg.roster[sg.activePlayerIdx];
  aim.angle = 85; aim.power = 150;
  shooter.dom.window.dispatch('keydown', { key: ' ', code: 'Space' });
  await until(() => gameOf(host).projectile && gameOf(guest).projectile, 5000, 'shot');
  console.log('projectile weapon =', gameOf(host).projectile.weapon);
  for (const b of [host, guest]) gameOf(b).roster.forEach(t => { if (t.slot !== activeSlot) t.hp = 0; });
  const TICK = host.ctx.globalThis.SCORCHED.CONST.TICK;
  for (let i = 0; i < 900; i++) {
    gameOf(host).stepPhysics(TICK); gameOf(guest).stepPhysics(TICK);
    if (!gameOf(host).projectile && !gameOf(guest).projectile) break;
  }
  await new Promise(r => setTimeout(r, 400));
  const hg = gameOf(host);
  console.log('--- after round end ---');
  console.log('matchOver =', hg.matchOver, 'currentRound =', hg.currentRound, 'shopping =', hg.shopping);
  const shop = host.el('shop');
  console.log('shop.hidden =', shop.hidden, 'children =', shop.children.length, 'html len =', String(shop.innerHTML||'').length);
  console.log('standings =', JSON.stringify(hg.standings));
  srv.close(); process.exit(0);
})().catch(e => { console.error('DIAG ERROR:', e.message); process.exit(1); });
