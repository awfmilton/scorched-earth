// Regression cover for a crash reported from a real play session:
//
//   "the game crashed in the SECOND ROUND when I got a DIRECT HIT that would
//    have WON me the round"
//
// Root cause was in the shop, not in ballistics. showShopForPlayer() renders a
// SELL button per row and disables it with:
//
//   if (count === Infinity || count < itemsToSell || isBasicOnly)
//
// f7c415e removed the `isBasicOnly` local but left that read behind. JS
// short-circuits, so the dangling reference is only evaluated when the first
// two operands are false — i.e. when the player holds a FULL sellable pack.
// Fuel is packSize 100 and is granted at exactly FUEL_PER_ROUND (100) at the
// top of every round, which makes the crash depend on whether you drove:
//
//   moved this round -> fuel < 100 -> short-circuits -> shop renders
//   did not move     -> fuel == 100 -> ReferenceError -> round transition dies
//
// A player who repositions in round 1 and then wins round 2 outright with a
// direct hit hits it on exactly the second round, which is what was reported.
//
// The round-end path is what these tests guard: reaching the intermission must
// never throw, whichever way the last opponent died.

const test = require('node:test');
const { describe, it, before, after } = test;
const assert = require('node:assert');

const { bootBrowser, startTestServer, until } = require('./helpers/browser-harness.js');

// Walk the shop DOM for a button, since the stand-in has no querySelector.
function findButton(el, label) {
  if (!el) return null;
  if (el.tagName === 'button' && (el.textContent || '').includes(label)) return el;
  for (const child of el.children || []) {
    const hit = findButton(child, label);
    if (hit) return hit;
  }
  return null;
}

// Boot the real page and start a local match: one human plus two AI.
async function startSoloMatch(port, track) {
  const b = bootBrowser(port);
  track.push(b);
  await until(
    () => b.ctx.globalThis.SCORCHED && b.ctx.globalThis.SCORCHED.gameInstance,
    10000,
    'game instance'
  );
  b.el('btn-solo').click();
  b.el('btn-start-solo').click();
  return { b, game: b.ctx.globalThis.SCORCHED.gameInstance };
}

// Kill `target` with a real shell landing on its hull, so the tank-collision
// branch runs (impact -> onImpact -> nextTurn -> round-over check) rather than
// the splash path. Returns once the round has settled.
function killWithDirectHit(game, target) {
  target.hp = 1; // one shell, one kill — the shot that wins the round
  game.projectiles = [{
    x: target.x,
    y: target.y - 10,
    vx: 0,
    vy: 60,
    weapon: 'Baby Missile',
    shooterIdx: 0,
    trigger: null
  }];
  for (let i = 0; i < 600 && game.projectiles.length > 0; i++) game.update(1 / 60);
  for (let i = 0; i < 300; i++) game.update(1 / 60); // let tanks settle
}

describe('Round transition after a round-winning shot', () => {
  let server;
  const browsers = [];

  before(async () => { server = await startTestServer(); });
  after(() => {
    // The page opens a live WebSocket on load; if these are left dangling the
    // file passes and then hangs forever instead of exiting.
    for (const b of browsers) b.close();
    server.close();
  });

  it('opens the shop after a direct hit wins round 2, with fuel untouched', async () => {
    const { b, game } = await startSoloMatch(server.port, browsers);
    const me = game.roster[0];

    // Round 1: the player repositions, so fuel is not a full pack and the
    // round 1 intermission renders even on the broken build.
    me.inventory.Fuel = 40;
    for (let i = 1; i < game.roster.length; i++) game.roster[i].hp = 0;
    game.update(1 / 60);

    const round1Done = findButton(b.el('shop'), 'DONE');
    assert.ok(round1Done, 'round 1 shop should render');
    round1Done.click();

    assert.strictEqual(game.currentRound, 2, 'should be in round 2');
    assert.strictEqual(
      me.inventory.Fuel, 100,
      'round 2 grants a full fuel pack, which is what arms the crash'
    );

    // Round 2: win it with a direct hit, having spent no fuel.
    game.activePlayerIdx = 0;
    game.roster[2].hp = 0;
    const target = game.roster[1];
    killWithDirectHit(game, target);

    assert.strictEqual(target.hp, 0, 'the direct hit should have killed the last opponent');
    assert.ok(game.roundOver, 'the round should have ended');

    // The crash was here: the round ended but the intermission never rendered.
    const round2Done = findButton(b.el('shop'), 'DONE');
    assert.ok(round2Done, 'round 2 shop should render after the round-winning direct hit');
  });

  it('renders every shop row while holding a full sellable pack', async () => {
    const { b, game } = await startSoloMatch(server.port, browsers);
    const me = game.roster[0];

    // Pin the short-circuit hazard directly: a full pack of every finite item
    // forces the sell-button guard past its first two operands on every row.
    me.cash = 1000000;
    const ITEMS = b.ctx.globalThis.SCORCHED.ITEMS;
    const WEAPONS = b.ctx.globalThis.SCORCHED.WEAPONS;
    [...ITEMS, ...WEAPONS].forEach(conf => {
      if (me.inventory[conf.id] === Infinity) return;
      me.inventory[conf.id] = conf.packSize;
    });

    assert.doesNotThrow(
      () => game.showShopForPlayer(0),
      'no shop row may reference an undefined local'
    );
    assert.ok(findButton(b.el('shop'), 'DONE'), 'shop should render fully');
  });

  it('opens the shop when the round is won by splash damage instead', async () => {
    const { b, game } = await startSoloMatch(server.port, browsers);
    const me = game.roster[0];
    me.inventory.Fuel = 40;

    for (let i = 1; i < game.roster.length; i++) game.roster[i].hp = 0;
    game.update(1 / 60);
    findButton(b.el('shop'), 'DONE').click();
    assert.strictEqual(game.currentRound, 2);

    // Same round boundary, reached the other way: no direct hull contact.
    for (let i = 1; i < game.roster.length; i++) game.roster[i].hp = 0;
    game.update(1 / 60);

    assert.ok(
      findButton(b.el('shop'), 'DONE'),
      'round 2 shop should render after a splash kill too'
    );
  });
});
