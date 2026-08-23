// Repro driver for the owner's report:
//   "crashed in the SECOND ROUND when I got a DIRECT HIT that would have WON me the round"
//
// Hypothesis: showShopForPlayer()'s sell-button guard reads `isBasicOnly`,
// which f7c415e left undefined. The expression short-circuits before reaching
// it unless the player holds a full sellable pack. Fuel is packSize 100 and is
// granted at exactly 100 per round, so:
//   - spend fuel moving  -> count < 100 -> short-circuit -> shop renders
//   - do not move        -> count == 100 -> isBasicOnly evaluated -> CRASH
// Round 1 the player moves; round 2 they win outright without moving.
const { bootBrowser, startTestServer, until } = require('../tests/helpers/browser-harness.js');

const findBtn = (el, label) => {
  if (!el) return null;
  if (el.tagName === 'button' && (el.textContent || '').includes(label)) return el;
  for (const c of el.children || []) {
    const hit = findBtn(c, label);
    if (hit) return hit;
  }
  return null;
};

const endRound = (game) => {
  for (let i = 1; i < game.roster.length; i++) game.roster[i].hp = 0;
  game.update(1 / 60);
};

(async () => {
  const srv = await startTestServer();
  const b = bootBrowser(srv.port);
  await until(() => b.ctx.globalThis.SCORCHED && b.ctx.globalThis.SCORCHED.gameInstance, 10000, 'game');

  b.el('btn-solo').click();
  b.el('btn-start-solo').click();
  const game = b.ctx.globalThis.SCORCHED.gameInstance;
  const me = game.roster[0];

  console.log('rounds=%d roster=%d fuel=%s', game.rounds, game.roster.length, me.inventory.Fuel);

  // ---- ROUND 1: the player MOVES, so fuel drops below a full pack ---------
  me.inventory.Fuel = 40;
  console.log('\n[round 1] player moved, fuel=%s', me.inventory.Fuel);
  try {
    endRound(game);
    const done = findBtn(b.el('shop'), 'DONE');
    console.log('[round 1] shop rendered: %s', !!done);
    done.click();
  } catch (err) {
    console.log('[round 1] UNEXPECTED CRASH: %s', err.message);
    srv.close();
    process.exit(1);
  }

  console.log('[round 2] started, currentRound=%s fuel refilled to %s',
    game.currentRound, me.inventory.Fuel);

  // ---- ROUND 2: win outright without moving, so fuel is a full pack -------
  try {
    endRound(game);
    const done = findBtn(b.el('shop'), 'DONE');
    console.log('[round 2] shop rendered: %s', !!done);
    console.log('\nNO CRASH');
  } catch (err) {
    console.log('\n*** CRASH REPRODUCED — round %d, player had not moved ***', game.currentRound);
    console.log(err.stack.split('\n').slice(0, 6).join('\n'));
  }

  srv.close();
  process.exit(0);
})().catch(e => { console.log('DRIVER ERROR:', e && e.stack); process.exit(1); });
