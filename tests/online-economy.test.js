// The economy, exercised through the real page in a real online match.
//
// The shop, cash and inventory-across-rounds were all implemented but only
// reachable in local mode, which has no UI entry point: handleRoundEnd()
// returned early when online and applyRoundEnd() went straight to the match
// summary. This test drives two browsers through a genuine multi-round match
// and asserts the progression actually survives a round boundary.

const test = require('node:test');
const { describe, it, before, after } = test;
const assert = require('node:assert');

const { createServer, attachWebSocketServer, createRoomManagerHandlers } = require('../server.js');
const RoomManager = require('../lib/room-manager.js');
const { bootBrowser, until, hashTerrain } = require('./helpers/browser-harness.js');

const gameOf = (b) => b.ctx.globalThis.SCORCHED.gameInstance;

// Walk the stand-in DOM for a button by its label.
function findButton(el, text) {
  if (!el) return null;
  if (el.tagName === 'button' && String(el.textContent || '').toUpperCase() === text) return el;
  for (const child of el.children || []) {
    const found = findButton(child, text);
    if (found) return found;
  }
  return null;
}

// The page sets some panels with innerHTML, which the DOM stand-in keeps
// separately from textContent, so both have to be collected.
function allText(el) {
  if (!el) return '';
  let out = String(el.textContent || '') + ' ' + String(el.innerHTML || '');
  for (const child of el.children || []) out += ' ' + allText(child);
  return out;
}

async function setupMatch(port, rounds) {
  const host = bootBrowser(port);
  const guest = bootBrowser(port);

  await until(() => gameOf(host), 10000, 'host game instance');
  await until(() => gameOf(guest), 10000, 'guest game instance');

  host.el('btn-create-match').click();
  await until(
    () => (host.el('display-share-code').textContent || '').trim().length === 4,
    10000,
    'share code'
  );
  const shareCode = host.el('display-share-code').textContent.trim();

  guest.el('join-code').value = shareCode;
  guest.el('btn-join-match').click();
  await until(() => host.el('multiplayer-slots').children.length >= 2, 10000, 'two players in the lobby');

  host.el('rounds').value = String(rounds);
  host.el('starting-cash').value = '10000';
  host.el('wall-type').value = 'off';
  host.el('start-btn').click();

  await until(() => gameOf(host).roster && gameOf(host).roster.length === 2, 10000, 'host round start');
  await until(() => gameOf(guest).roster && gameOf(guest).roster.length === 2, 10000, 'guest round start');

  return { host, guest };
}

// Fires a real shot, then zeroes the non-shooter on BOTH clients so the
// resolution report eliminates it and the server declares the round over.
async function endRound(host, guest) {
  const activeSlot = gameOf(host).roster[gameOf(host).activePlayerIdx].slot;
  const shooter = gameOf(host).mySlot === activeSlot ? host : guest;

  const shooterGame = gameOf(shooter);
  const aim = shooterGame.roster[shooterGame.activePlayerIdx];
  aim.angle = 85;
  aim.power = 150;

  shooter.dom.window.dispatch('keydown', { key: ' ', code: 'Space' });
  await until(() => gameOf(host).projectile && gameOf(guest).projectile, 10000, 'the shot on both clients');

  for (const b of [host, guest]) {
    gameOf(b).roster.forEach(t => { if (t.slot !== activeSlot) t.hp = 0; });
  }

  const TICK = host.ctx.globalThis.SCORCHED.CONST.TICK;
  for (let i = 0; i < 900; i++) {
    gameOf(host).stepPhysics(TICK);
    gameOf(guest).stepPhysics(TICK);
    if (!gameOf(host).projectile && !gameOf(guest).projectile) break;
  }

  return activeSlot;
}

describe('Online economy across rounds', () => {
  let server, wss, port;

  before(async () => {
    const handlers = createRoomManagerHandlers(new RoomManager());
    server = createServer();
    await new Promise((resolve) => server.listen(0, '127.0.0.1', () => {
      port = server.address().port;
      resolve();
    }));
    wss = attachWebSocketServer(server, {
      onMessage: handlers.onMessage,
      onDisconnect: handlers.onDisconnect
    });
  });

  after(() => {
    wss.close();
    server.close();
  });

  it('opens a shop between rounds instead of ending the match', async () => {
    const { host, guest } = await setupMatch(port, 2);

    await endRound(host, guest);

    // Both clients must land in the intermission, not the match summary.
    await until(() => gameOf(host).matchOver === false, 10000, 'host intermission');
    await until(() => gameOf(guest).matchOver === false, 10000, 'guest intermission');

    for (const [label, b] of [['host', host], ['guest', guest]]) {
      const shopEl = b.el('shop');
      assert.strictEqual(shopEl.hidden, false, `${label} shop must be visible`);
      const text = allText(shopEl);
      assert.match(text, /CASH:/, `${label} shop must show cash`);
      assert.match(text, /STANDINGS/, `${label} shop must show between-round standings`);
      assert.ok(findButton(shopEl, 'DONE'), `${label} shop must have a DONE button`);
      assert.ok(findButton(shopEl, 'BUY'), `${label} shop must offer something to buy`);
      assert.doesNotMatch(text, /FINAL MATCH SUMMARY/, `${label} must not see the match summary yet`);
    }

    // Standings carry the server's rounds-won, which no client computes.
    const standings = gameOf(host).standings;
    assert.ok(Array.isArray(standings) && standings.length === 2, 'standings for both players');
    assert.strictEqual(standings.reduce((n, s) => n + (s.roundsWon || 0), 0), 1, 'exactly one round won so far');
  });

  it('carries cash and inventory bought in the shop into the next round', async () => {
    const { host, guest } = await setupMatch(port, 2);
    await endRound(host, guest);
    await until(() => gameOf(host).matchOver === false, 10000, 'host intermission');
    await until(() => gameOf(guest).matchOver === false, 10000, 'guest intermission');

    const hostGame = gameOf(host);
    const myTank = hostGame.roster.find(t => t.slot === hostGame.mySlot);
    const cashBefore = myTank.cash;
    const ownedBefore = myTank.inventory['Missile'] || 0;

    assert.ok(hostGame.buy(myTank, 'Missile'), 'the purchase must succeed');
    assert.ok(myTank.cash < cashBefore, 'buying must cost cash');
    assert.ok((myTank.inventory['Missile'] || 0) > ownedBefore, 'buying must add ammo');

    const cashAfterBuy = myTank.cash;
    const ownedAfterBuy = myTank.inventory['Missile'];

    // One player leaving the shop is not enough to start the round.
    findButton(host.el('shop'), 'DONE').click();
    await new Promise(r => setTimeout(r, 150));
    assert.strictEqual(gameOf(host).currentRound, 1, 'the round must not advance on one DONE');
    assert.match(allText(host.el('shop')), /WAITING FOR OTHER PLAYERS/, 'host must be told it is waiting');

    findButton(guest.el('shop'), 'DONE').click();

    await until(() => gameOf(host).currentRound === 2, 10000, 'round 2 on the host');
    await until(() => gameOf(guest).currentRound === 2, 10000, 'round 2 on the guest');

    // The progression survived the round boundary. Re-running start() here
    // instead of applyServerRoundStart() would reset both of these.
    const myTankR2 = gameOf(host).roster.find(t => t.slot === gameOf(host).mySlot);
    assert.strictEqual(myTankR2.cash, cashAfterBuy, 'cash must carry into the new round');
    assert.strictEqual(myTankR2.inventory['Missile'], ownedAfterBuy, 'inventory must carry into the new round');

    // A new round is a new world, and both clients must agree on it.
    assert.strictEqual(
      hashTerrain(gameOf(host)),
      hashTerrain(gameOf(guest)),
      'round 2 terrain must be byte-identical on both clients'
    );
    assert.strictEqual(gameOf(host).wind, gameOf(guest).wind, 'round 2 wind must agree');
    gameOf(host).roster.forEach(t => {
      assert.strictEqual(t.hp, 100, `slot ${t.slot} must be revived for the new round`);
    });

    // Both clients must agree whose turn it is, or they drive different tanks.
    assert.strictEqual(
      gameOf(host).roster[gameOf(host).activePlayerIdx].slot,
      gameOf(guest).roster[gameOf(guest).activePlayerIdx].slot,
      'both clients must open round 2 on the same slot'
    );
    assert.strictEqual(gameOf(host).shopDoneSentForRound, 1, 'SHOP_DONE is sent once per round');
  });

  it('ends the match after the final round', async () => {
    const { host, guest } = await setupMatch(port, 1);

    await endRound(host, guest);

    await until(() => gameOf(host).matchOver === true, 10000, 'host match over');
    assert.match(allText(host.el('shop')), /FINAL MATCH SUMMARY/, 'the final round shows the summary');
  });
});
