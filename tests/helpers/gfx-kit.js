// Loads the Æthercastle sprite kit (gfx/*.js) into a harness vm context.
//
// The page resolves the kit off `window`, which in a browser IS the global and
// under a harness is an ordinary object on the context. So the kit has to be
// published onto the SAME `window` the harness hands the page script, before
// that script runs.
//
// The sources are run INSIDE the context rather than require()d in the host
// realm, and that distinction is the whole point of this file: a required
// module would close over the host's `Math`, so render-purity's banRandom
// probe — which shadows Math.random on the context — would sail straight past
// a Math.random() sitting in a sprite. Running them in-context means the kit
// is held to the same purity contract as the page.
//
// Load order is the same one index.html uses: ac-common publishes ACG, which
// the other five read at load time.

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const GFX = path.join(__dirname, '..', '..', 'gfx');

const FILES = [
  'ac-common.js',
  'ac-sky.js',
  'ac-terrain.js',
  'ac-chassis.js',
  'ac-structures.js',
  'ac-weapons.js'
];

// Same reasoning as the page script's compile cache: these suites build dozens
// of fresh contexts per run, and a vm.Script can be compiled once and run in
// all of them without sharing any state between them.
const scripts = FILES.map(name => new vm.Script(
  fs.readFileSync(path.join(GFX, name), 'utf8'),
  { filename: path.join('gfx', name) }
));

/**
 * Publish the kit onto `context.window`.
 *
 * @param {Object} context An already-contextified vm sandbox carrying a
 *   `window` object — the same one the page script will resolve through.
 */
function loadKitInto(context) {
  for (const script of scripts) script.runInContext(context);
  return context;
}

module.exports = { loadKitInto, FILES };
