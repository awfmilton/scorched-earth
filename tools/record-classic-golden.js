// Record the golden classic frame log.
//
// The fixture this writes is the ordered list of canvas operations that commit
// 63de891 — the LAST build before the visualisation layer existed — issued for
// a fixed scene. That provenance is the whole point: a golden recorded from the
// CURRENT build would only prove the current build agrees with itself, and
// would silently bake in any drift already present. Recording from the old
// build makes the fixture an independent statement of what the easter egg is
// supposed to look like.
//
// The old build had no theme switch at all — it drew the DOS-era screen in
// every mode — so its output IS classic mode's contract.
//
//   node tools/record-classic-golden.js            # verify, print a diff summary
//   node tools/record-classic-golden.js --write    # (re)write the fixture
//
// Rewriting is a deliberate act. If this prints a diff, the default assumption
// is that the easter egg broke, NOT that the fixture is stale.

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const {
  loadScorchedFrom, renderableGame, frameLog, richScene, GOLDEN_BASE
} = require('../tests/helpers/render-harness.js');

const REPO = path.join(__dirname, '..');
const FIXTURE = path.join(REPO, 'tests', 'fixtures', 'classic-frame.golden.txt');

// One operation per line under a `## biome` header. Plain text rather than
// JSON so that when this fixture does drift, `git diff` names the exact canvas
// call that moved instead of showing one reflowed 300KB line.
const BIOMES = ['mountains', 'plains', 'plateau', 'hills'];

function serialise(logs) {
  return BIOMES.map(b => `## ${b}\n${logs[b].join('\n')}`).join('\n') + '\n';
}

function record(source) {
  const SCORCHED = loadScorchedFrom(source);
  const out = {};
  for (const biome of BIOMES) {
    const game = renderableGame(SCORCHED, { gameMode: 'classic' });
    richScene(game, biome);
    out[biome] = frameLog(game);
  }
  return out;
}

const headSource = execFileSync('git', ['show', `${GOLDEN_BASE}:index.html`],
  { cwd: REPO, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

const golden = record(headSource);
const total = Object.values(golden).reduce((n, l) => n + l.length, 0);

if (process.argv.includes('--write')) {
  fs.mkdirSync(path.dirname(FIXTURE), { recursive: true });
  fs.writeFileSync(FIXTURE, serialise(golden));
  console.log(`wrote ${path.relative(REPO, FIXTURE)} from ${GOLDEN_BASE}: ${total} ops across 4 biomes`);
} else {
  const live = record(fs.readFileSync(path.join(REPO, 'index.html'), 'utf8'));
  let drift = 0;
  for (const biome of Object.keys(golden)) {
    const a = golden[biome], b = live[biome];
    const n = Math.max(a.length, b.length);
    for (let i = 0; i < n; i++) {
      if (a[i] !== b[i]) {
        if (drift === 0) console.log(`first drift in ${biome} at op ${i}:\n  ${GOLDEN_BASE}: ${a[i]}\n  working:  ${b[i]}`);
        drift++;
      }
    }
  }
  console.log(drift === 0
    ? `classic is byte-identical to ${GOLDEN_BASE}: ${total} ops across 4 biomes`
    : `${drift} operations differ from ${GOLDEN_BASE}`);
  process.exit(drift === 0 ? 0 : 1);
}
