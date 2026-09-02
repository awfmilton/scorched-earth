// Combat feedback actually reaches the screen.
//
// The review fleet's root cause for "an unrelated far-away enemy received the
// same damage" was not a damage bug at all: turret volleys were invisible,
// damage numbers were pushed but never drawn, and no per-tank hp was displayed
// anywhere. Each of those three feedback surfaces gets a regression test here,
// asserting against the recorded draw-call log the same way the parity suite
// does — presence of the primitive, not just absence of a crash.

const test = require('node:test');
const assert = require('node:assert');
const {
  loadScorched, renderableGame, frameLog, richScene
} = require('./helpers/render-harness.js');

test('damage numbers are rendered, with the pushed text and colour', () => {
  const SCORCHED = loadScorched();
  const game = richScene(renderableGame(SCORCHED), 'mountains');

  game.damageNumbers = [
    { x: 300.5, y: 200.25, text: '30', color: '#ff4444', life: 45 },
    { x: 512.125, y: 240.75, text: '17', color: '#00ffff', life: 10 }
  ];

  const log = frameLog(game).join('\n');
  assert.match(log, /fillText\(30,300\.5,200\.25\)/, 'hull damage number not drawn');
  assert.match(log, /fillText\(17,512\.125,240\.75\)/, 'shield absorb number not drawn');
  assert.match(log, /fillStyle=#ff4444/, 'damage number colour not applied');
});

test('an empty damage-number array draws no text at all', () => {
  const SCORCHED = loadScorched();
  const game = richScene(renderableGame(SCORCHED), 'mountains');
  game.damageNumbers = [];

  const log = frameLog(game).join('\n');
  assert.doesNotMatch(log, /fillText/, 'text drawn with nothing to say');
});

test('turret bolts draw an attribution line from turret head to victim', () => {
  const SCORCHED = loadScorched();
  const game = richScene(renderableGame(SCORCHED), 'mountains');

  game.turretBolts = [{ x1: 100.5, y1: 80.25, x2: 400.75, y2: 300.5, life: 12, maxLife: 24 }];

  const log = frameLog(game).join('\n');
  assert.match(log, /setLineDash\(\[6 3\]\)/, 'bolt dash pattern missing');
  assert.match(log, /moveTo\(100\.5,80\.25\)/, 'bolt does not start at the turret');
  assert.match(log, /lineTo\(400\.75,300\.5\)/, 'bolt does not end at the victim');
  assert.match(log, /arc\(100\.5,80\.25,1\.5,0,/, 'muzzle flash missing at the turret head');
});

test('a turret volley records a bolt on a drawing client and nothing on a headless one', () => {
  const SCORCHED = loadScorched();
  const StructuresLib = require('../lib/structures.js');
  const spec = StructuresLib.STRUCTURES['scorpion-crossbow'];
  assert.ok(spec && spec.turret, 'scorpion-crossbow must exist and carry a turret');

  // Drawing client: force a standing scorpion next to an enemy and run the
  // turn-boundary pass. The sim outcome (the explosion) is exercised by the
  // structures suites; here we only care that the volley left a visible trace.
  const game = renderableGame(SCORCHED);
  const [a, b] = game.roster;
  game.structures = [{ key: 'scorpion-crossbow', hp: 60, owner: a.slot, ownerIdx: 0, x: b.x - 50, y: 400, cooldown: 0 }];
  game.applyStructureTurnEffects();
  assert.ok(game.turretBolts && game.turretBolts.length > 0, 'no bolt recorded for a live volley');

  // Headless twin of the same scenario stays clean — bolts are render-only.
  const head = renderableGame(SCORCHED);
  head.headless = true;
  head.structures = [{ key: 'scorpion-crossbow', hp: 60, owner: head.roster[0].slot, ownerIdx: 0, x: head.roster[1].x - 50, y: 400, cooldown: 0 }];
  head.applyStructureTurnEffects();
  assert.ok(!head.turretBolts || head.turretBolts.length === 0, 'headless client grew render state');
});

test('every living Aethercastle hull carries an hp bar; classic carries none', () => {
  const SCORCHED = loadScorched();

  const ac = richScene(renderableGame(SCORCHED), 'mountains');
  const acLog = frameLog(ac).join('\n');
  // Tank A sits at x=200.375, y=400.625 → bar frame at (190.375, 372.625).
  assert.match(acLog, /fillRect\(190\.375,372\.625,20,5\)/, 'hp bar frame missing over the live hull');

  const classic = richScene(renderableGame(SCORCHED, { gameMode: 'classic' }), 'mountains');
  const classicLog = frameLog(classic).join('\n');
  assert.doesNotMatch(classicLog, /fillRect\(190\.375,372\.625/, 'classic replica grew an hp bar');
});

test('the hp bar length tracks the hull hp fraction', () => {
  const SCORCHED = loadScorched();
  const game = richScene(renderableGame(SCORCHED), 'mountains');
  const a = game.roster[0];
  a.hp = 25;
  a.maxHp = 100;

  const log = frameLog(game).join('\n');
  // 25/100 of an 18px bar → 4.5px fill, drawn in the low-hp colour.
  assert.match(log, /fillRect\(191\.375,373\.625,4\.5,3\)/, 'hp bar fill does not track hp');
});
