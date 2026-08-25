// The client and server chassis tables must not drift.
//
// The comment above CHASSIS in index.html has claimed this file exists since
// the table was written ("tests/chassis-registry.test.js fails if the two
// drift apart"). It did not exist. The simulation fields below decide where a
// tank ends up after a MOVE_SYNC, so a drifted value is not a cosmetic bug: it
// is two clients placing the same hull in two different places, which is the
// silent desync the lockstep work has spent three commits closing.

const test = require('node:test');
const assert = require('node:assert');
const { loadScorched } = require('./helpers/render-harness.js');
const CONSTANTS = require('../lib/constants.js');

// Everything the SIMULATION reads. Anything not on this list is presentation
// and may legitimately exist on one side only.
const SIM_FIELDS = [
  'id', 'name', 'locomotion', 'hp', 'armour', 'driveStep', 'maxClimb',
  'fuel', 'fuelPerStep', 'strideClearance', 'cruiseAltitude', 'windDrift',
  'fieldRegen', 'hoverClearance'
];

test('both tables define the same chassis, in the same order', () => {
  const { CHASSIS } = loadScorched();
  // Order matters as well as membership: a chassis is chosen by index in the
  // lobby selector, and CHASSIS_IDS is derived from key order on both sides.
  assert.deepStrictEqual(Object.keys(CHASSIS), Object.keys(CONSTANTS.CHASSIS));
});

test('every simulation field is identical on both sides', () => {
  const { CHASSIS } = loadScorched();

  for (const id of Object.keys(CONSTANTS.CHASSIS)) {
    const client = CHASSIS[id];
    const server = CONSTANTS.CHASSIS[id];
    for (const field of SIM_FIELDS) {
      assert.strictEqual(client[field], server[field],
        `${id}.${field}: client ${client[field]} vs server ${server[field]}`);
    }
  }
});

test('the server table carries no draw data', () => {
  // The split is deliberate: the server has no use for a colour or a hull
  // size, and a renderer field that reached the wire would invite someone to
  // start trusting it.
  for (const [id, spec] of Object.entries(CONSTANTS.CHASSIS)) {
    for (const field of ['accent', 'hullW', 'hullH', 'tier', 'blurb']) {
      assert.strictEqual(spec[field], undefined, `server ${id} grew ${field}`);
    }
  }
});

test('every client chassis carries the draw data the renderer needs', () => {
  const { CHASSIS, THEMES } = loadScorched();
  const palette = new Set(Object.values(THEMES.aethercastle).filter(v => typeof v === 'string'));

  for (const [id, spec] of Object.entries(CHASSIS)) {
    assert.strictEqual(typeof spec.accent, 'string', `${id} has no accent`);
    assert.ok(Number.isFinite(spec.hullW) && spec.hullW > 0, `${id} has no hullW`);
    assert.ok(Number.isFinite(spec.hullH) && spec.hullH > 0, `${id} has no hullH`);
    // Accents come from the palette rather than being invented per chassis,
    // so a palette change carries through to the vehicles.
    assert.ok(palette.has(spec.accent), `${id}.accent ${spec.accent} is not a palette token`);
  }
});

test('every locomotion the table uses has a renderer branch', () => {
  const { CHASSIS } = loadScorched();
  // drawTank switches on locomotion and its default arm draws the hover body.
  // A new locomotion that silently fell through to it would look like a drone.
  const drawn = new Set(['tracked', 'legged', 'aerial', 'hover']);
  for (const [id, spec] of Object.entries(CHASSIS)) {
    assert.ok(drawn.has(spec.locomotion),
      `${id} has locomotion ${spec.locomotion}, which drawTank does not draw`);
  }
});

test('hull sizes are distinct enough to tell apart', () => {
  const { CHASSIS } = loadScorched();
  const sizes = Object.values(CHASSIS).map(c => `${c.hullW}x${c.hullH}`);
  assert.ok(new Set(sizes).size >= 5,
    `only ${new Set(sizes).size} distinct hull sizes across six chassis`);
});
