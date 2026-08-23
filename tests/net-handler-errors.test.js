// A bug thrown by an S2C message handler must be reported AS a handler bug,
// and must not kill the socket.
//
// NetClient.onmessage used to wrap the JSON.parse and the handler call in one
// try. Any exception a handler threw was therefore relabelled PARSE_ERROR —
// "the server sent garbage" — and swallowed. That is how a ReferenceError in
// the shop renderer shipped to production: every online match reached the
// intermission, the shop silently failed to render, and nothing reported it.
//
// These tests hold the two failure modes apart.

const { describe, it } = require('node:test');
const assert = require('node:assert');

const { bootBrowser, until, startTestServer } = require('./helpers/browser-harness.js');

// Drive NetClient.onmessage directly with a canned frame. Booting a browser
// gives us the real class, built and connected exactly as the page builds it,
// with its real dispatch table.
async function netOf(port) {
  const b = bootBrowser(port);
  await until(() => b.ctx.globalThis.SCORCHED.gameInstance, 10000, 'game instance');
  const net = new b.ctx.globalThis.SCORCHED.NetClient();
  net.connect();
  await until(() => net.socket && typeof net.socket.onmessage === 'function', 10000, 'socket');
  return { b, net, close: () => { net.shouldReconnect = false; net.socket.close(); } };
}

describe('S2C handler errors', () => {
  it('reports a throwing handler as HANDLER_ERROR, not PARSE_ERROR', async () => {
    const srv = await startTestServer();
    try {
      const { net, close } = await netOf(srv.port);

      const seen = [];
      net.onError = (err) => seen.push(err);
      net.handleError = (err) => seen.push(err);

      net.dispatchTable.ROOM_LIST = () => { throw new Error('boom from a handler'); };
      net.socket.onmessage({ data: JSON.stringify({ type: 'ROOM_LIST', rooms: [] }) });

      assert.strictEqual(seen.length, 1, 'exactly one error is reported');
      assert.strictEqual(seen[0].type, 'HANDLER_ERROR', 'a handler bug is not a parse error');
      assert.strictEqual(seen[0].messageType, 'ROOM_LIST', 'it names the message that failed');
      assert.match(String(seen[0].error && seen[0].error.message), /boom from a handler/);
    } finally {
      if (typeof close === 'function') close();
      srv.close();
    }
  });

  it('still reports genuinely malformed frames as PARSE_ERROR', async () => {
    const srv = await startTestServer();
    try {
      const { net, close } = await netOf(srv.port);

      const seen = [];
      net.onError = (err) => seen.push(err);
      net.handleError = (err) => seen.push(err);

      net.socket.onmessage({ data: '{not json at all' });

      assert.strictEqual(seen.length, 1, 'exactly one error is reported');
      assert.strictEqual(seen[0].type, 'PARSE_ERROR', 'bad JSON is still a parse error');
    } finally {
      if (typeof close === 'function') close();
      srv.close();
    }
  });

  it('a throwing handler does not stop later messages being handled', async () => {
    const srv = await startTestServer();
    try {
      const { net, close } = await netOf(srv.port);
      net.handleError = () => {};

      let good = 0;
      net.dispatchTable.ROOM_LIST = () => { throw new Error('boom'); };
      net.dispatchTable.ROOM_STATE = () => { good++; };

      net.socket.onmessage({ data: JSON.stringify({ type: 'ROOM_LIST', rooms: [] }) });
      net.socket.onmessage({ data: JSON.stringify({ type: 'ROOM_STATE', code: 'ABCD' }) });

      assert.strictEqual(good, 1, 'the socket keeps working after a handler throws');
    } finally {
      if (typeof close === 'function') close();
      srv.close();
    }
  });
});

describe('the online shop actually renders', () => {
  // The direct regression guard for the shipped bug: showShopForPlayer must
  // not throw for an online client. online-economy.test.js covers the whole
  // round-boundary flow; this one fails loudly and immediately if the shop
  // renderer references something that is not in scope.
  it('showShopForPlayer completes without throwing', async () => {
    const srv = await startTestServer();
    try {
      const b = bootBrowser(srv.port);
      await until(() => b.ctx.globalThis.SCORCHED.gameInstance, 10000, 'game instance');
      const game = b.ctx.globalThis.SCORCHED.gameInstance;

      game.headless = false;
      game.config = { weaponsAvailability: 'basic', isMultiplayer: true };
      game.mySlot = 0;
      game.roster = [{
        slot: 0, name: 'Player 1', type: 'Human', color: '#ff2d9b', cash: 10000,
        inventory: { 'Baby Missile': Infinity, 'Missile': 10 }, hp: 100, alive: true
      }];
      game.standings = [{ slot: 0, name: 'Player 1', roundsWon: 1 }];

      // Basic tier is the case that broke: it is the branch the stranded
      // `isBasicOnly` reference guarded.
      assert.doesNotThrow(() => game.showShopForPlayer(0, {
        standings: game.standings,
        onDone: () => {}
      }));

      const shop = b.el('shop');
      assert.strictEqual(shop.hidden, false, 'the shop is shown');
      assert.ok(shop.children.length > 0, 'the shop actually rendered content');
    } finally {
      if (typeof close === 'function') close();
      srv.close();
    }
  });
});
