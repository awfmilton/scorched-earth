/**
 * Deployed-environment acceptance check.
 *
 * smoke-remote.mjs proves the host is up and speaks the protocol. This goes further and
 * asserts the things a player actually depends on, against the DEPLOYED build:
 *
 *   1. the page renders (HTTP 200, non-empty)
 *   2. the served bundle is the CURRENT build, not a stale earlier deploy
 *      (the lockstep frames must be bound to the Game object, not console.log stubs)
 *   3. the lobby markup that displays the share code is present
 *   4. a match can be created and the server returns a 4-char share code
 *   5. a SECOND client joining with that code lands in the SAME lobby, and both
 *      clients see both players with the correct slot count
 *   6. a bad code is rejected with UNKNOWN_ROOM rather than hanging or 500ing
 *
 * A suspended app-host serves zero bytes for ~100s while it wakes, so the default
 * budget is generous. Override with SMOKE_TIMEOUT_MS.
 *
 *   node scripts/verify-deployed.mjs https://scorched-earth-live.kodex.tbay.tk
 */
import WebSocket from 'ws';

const TIMEOUT_MS = Number(process.env.SMOKE_TIMEOUT_MS) > 0
  ? Number(process.env.SMOKE_TIMEOUT_MS)
  : 150000;

const target = process.argv[2];
if (!target) {
  console.error('usage: node scripts/verify-deployed.mjs <https://host>');
  process.exit(1);
}
const url = new URL(target);
const wsBase = `${url.protocol === 'https:' ? 'wss:' : 'ws:'}//${url.host}`;

let failures = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
};

/** Open a socket and resolve once `predicate` matches an inbound frame. */
function client(id) {
  const ws = new WebSocket(wsBase);
  const seen = [];
  const waiters = [];
  // The socket may finish opening before open() is awaited (all clients are
  // constructed up front), so latch the result rather than relying on a late listener.
  let openState = 'pending';
  let openError = null;
  const openWaiters = [];
  ws.on('open', () => {
    openState = 'open';
    openWaiters.splice(0).forEach((w) => w.resolve());
  });
  ws.on('error', (e) => {
    if (openState === 'pending') {
      openState = 'error';
      openError = e;
      openWaiters.splice(0).forEach((w) => w.reject(new Error(`${id}: ${e.message}`)));
    }
  });
  ws.on('message', (data) => {
    let frame;
    try { frame = JSON.parse(data.toString('utf8')); } catch { return; }
    seen.push(frame);
    for (let i = waiters.length - 1; i >= 0; i--) {
      if (waiters[i].predicate(frame)) waiters.splice(i, 1)[0].resolve(frame);
    }
  });
  return {
    id,
    ws,
    open: () => new Promise((resolve, reject) => {
      if (openState === 'open') return resolve();
      if (openState === 'error') return reject(new Error(`${id}: ${openError?.message}`));
      const t = setTimeout(() => reject(new Error(`${id}: socket open timed out`)), TIMEOUT_MS);
      openWaiters.push({
        resolve: () => { clearTimeout(t); resolve(); },
        reject: (e) => { clearTimeout(t); reject(e); }
      });
    }),
    send: (msg) => ws.send(JSON.stringify(msg)),
    // Matches frames already received, so we never miss one that raced in.
    await: (predicate, what) => new Promise((resolve, reject) => {
      const hit = seen.find(predicate);
      if (hit) return resolve(hit);
      const t = setTimeout(
        () => reject(new Error(`${id}: timed out waiting for ${what}. saw: ${seen.map(f => f.type).join(',') || '(nothing)'}`)),
        TIMEOUT_MS
      );
      waiters.push({ predicate, resolve: (f) => { clearTimeout(t); resolve(f); } });
    }),
    close: () => { try { ws.removeAllListeners(); ws.close(); } catch { /* already gone */ } }
  };
}

const a = client('client-A');
const b = client('client-B');
const bad = client('client-C');

try {
  // ---- 1-3: the page itself -------------------------------------------------
  const t0 = performance.now();
  const res = await fetch(url.href, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  const body = await res.text();
  const ms = Math.round(performance.now() - t0);

  check('page renders', res.status === 200 && body.length > 0, `HTTP ${res.status}, ${body.length} bytes, ${ms}ms`);
  check('share-code UI is present in the served page', body.includes('display-share-code'));
  check(
    'deployed bundle is the CURRENT build (lockstep bound, not stubbed)',
    body.includes("this.toGame('applyFireSync'") && body.includes('applyFireSync(msg)'),
    body.includes('gameplay frames stay log-only') ? 'STALE BUILD: still has log-only stubs' : 'lockstep frames wired'
  );

  // ---- 4: create a match ----------------------------------------------------
  await a.open();
  a.send({ type: 'CREATE_ROOM', isPublic: false });
  const created = await a.await((f) => f.type === 'ROOM_STATE', 'ROOM_STATE (create)');
  const code = created.code;
  check('a match can be created and returns a share code', typeof code === 'string' && code.length === 4, `code=${code}`);
  check('creator is seated in the new lobby', Array.isArray(created.players) && created.players.length === 1,
    `${created.players?.length} player, phase=${created.phase}`);

  // ---- 5: a second client joins with that code ------------------------------
  await b.open();
  b.send({ type: 'JOIN_ROOM', code });
  const joined = await b.await((f) => f.type === 'ROOM_STATE' && f.players?.length === 2, 'ROOM_STATE (join, 2 players)');
  const aSees = await a.await((f) => f.type === 'ROOM_STATE' && f.players?.length === 2, 'ROOM_STATE broadcast to creator');

  check('second client joins with the share code', joined.code === code, `joined room ${joined.code}`);
  check('both clients are in the SAME lobby', joined.code === code && aSees.code === code, `A sees ${aSees.code}, B sees ${joined.code}`);
  check('both clients see BOTH players', joined.players.length === 2 && aSees.players.length === 2,
    `A sees ${aSees.players.length}, B sees ${joined.players.length}`);
  check('players occupy distinct slots', new Set(joined.players.map(p => p.slot)).size === 2,
    `slots ${joined.players.map(p => p.slot).join(',')} of 4 — ${4 - joined.players.length} remaining`);
  check('no player token leaks to the other client',
    !joined.players.some(p => p.playerToken) && !aSees.players.some(p => p.playerToken));

  // ---- 6: a bad code is rejected -------------------------------------------
  await bad.open();
  bad.send({ type: 'JOIN_ROOM', code: 'ZZZZ' });
  const err = await bad.await((f) => f.type === 'ERROR', 'ERROR (bad code)');
  check('a nonexistent code is rejected cleanly', err.code === 'UNKNOWN_ROOM', `got ${err.code}`);

  // ---- 7: the match starts and a real turn is played -----------------------
  // Under lockstep every client re-simulates the same inputs, so the deployed
  // server must hand both clients the SAME seed/wind and the SAME shot vector.
  // A mismatch here is the silent desync, observed over the real network.
  a.send({ type: 'START_GAME', config: {} });
  const startA = await a.await((f) => f.type === 'ROUND_START', 'ROUND_START (A)');
  const startB = await b.await((f) => f.type === 'ROUND_START', 'ROUND_START (B)');

  check('the match starts for both players', !!startA && !!startB,
    `A slot ${startA.yourSlot}, B slot ${startB.yourSlot}`);
  check('both clients receive an IDENTICAL world seed', startA.seed === startB.seed && startA.seed !== undefined,
    `seed=${startA.seed}`);
  check('both clients receive identical wind and turn order',
    startA.wind === startB.wind && JSON.stringify(startA.turnOrder) === JSON.stringify(startB.turnOrder),
    `wind=${startA.wind}, turnOrder=[${startA.turnOrder}]`);

  // turnOrder[0] fires. Whichever client owns that slot is the shooter.
  const firstSlot = startA.turnOrder[0];
  const shooter = startA.yourSlot === firstSlot ? a : b;
  shooter.send({ type: 'FIRE', angle: 45, power: 500, weapon: 'Baby Missile' });

  const syncA = await a.await((f) => f.type === 'FIRE_SYNC', 'FIRE_SYNC (A)');
  const syncB = await b.await((f) => f.type === 'FIRE_SYNC', 'FIRE_SYNC (B)');
  check('a shot fired by one player reaches BOTH clients', !!syncA && !!syncB, `shooterSlot=${syncA.shooterSlot}`);
  check('both clients get a byte-identical shot vector (no desync)',
    syncA.vx === syncB.vx && syncA.vy === syncB.vy && syncA.wind === syncB.wind && syncA.shotId === syncB.shotId,
    `vx=${syncA.vx}, vy=${syncA.vy}, wind=${syncA.wind}`);

  // The shooter reports resolution; the server advances the turn for everyone.
  shooter.send({ type: 'RESOLVE_SHOT', shotId: syncA.shotId, eliminated: [] });
  const turnA = await a.await((f) => f.type === 'TURN_SYNC', 'TURN_SYNC (A)');
  const turnB = await b.await((f) => f.type === 'TURN_SYNC', 'TURN_SYNC (B)');
  check('the turn advances to the next player on both clients',
    turnA.activeSlot === turnB.activeSlot && turnA.activeSlot !== firstSlot,
    `activeSlot ${firstSlot} -> ${turnA.activeSlot}, turn ${turnA.turnNumber}`);
} catch (e) {
  check(`verification aborted`, false, e.message);
} finally {
  a.close(); b.close(); bad.close();
}

console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
