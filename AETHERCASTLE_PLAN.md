# Æthercastle: Armored Alchemists — Implementation Plan

Re-skin and expansion of `scorched-earth` into *Æthercastle: Armored Alchemists*, using the
design system at `.claude/skills/aethercastle-design/`.

**This document is written to be executed literally.** Every item names the file and the
anchor it touches, where its randomness comes from, and the test that proves it.

---

## 0. Ground truth and anchoring convention

### 0.1 Snapshot

Verified 2026-08-22 against the working tree:

| Fact | Value |
| --- | --- |
| `index.html` | **4744 lines** working tree / 4681 at `HEAD` (uncommitted work in progress, see 0.3) |
| `<style>` block | lines 7–211 |
| `<body>` / `#hud` / `<canvas id="game">` | 213 / 214 / 215 |
| Lobby + shop DOM | 216–387 |
| `<script src="lib/terrain.js">` | 388 |
| The one and only inline `<script>` | 389 → `</script>` at 4743 |
| Simulation fence | `// === BEGIN SIMULATION PATH ===` **584** → `// === END SIMULATION PATH ===` **3394** |
| Test suite | 25 files, 205 tests (203 pass, 2 skipped, 0 fail), `npm test` = `node --test --test-force-exit "tests/*.test.js"` |
| Dependencies | `ws@^8` only. **Zero devDependencies. No bundler, no linter, no jsdom, no React.** |
| CI | `.github/workflows/ci.yml`, `timeout-minutes: 5` on the test job, `cancel-in-progress: true` |

### 0.2 Anchoring convention — READ THIS FIRST

**The line numbers in the original brief are stale (they describe a 4654-line file) and the
line numbers in this document will go stale the moment Phase 1 lands.**

Every item below is anchored by a **unique text string**, given in `backticks`. Locate it with
`grep -n '<anchor>' index.html`. Line numbers, where given, are advisory only and marked
"≈". Do not trust them; re-grep.

Verified anchor table (grep these, do not memorise the numbers):

| Anchor string | ≈ line | What |
| --- | --- | --- |
| `const CONST = {` | 393 | engine constants |
| `const WEAPONS = [` | 414 | weapon registry |
| `const WEAPONS_BY_ID = new Map` | 461 | |
| `const SHIELD_TYPES = {` | 474 | |
| `const TRIGGER_PRIORITY = [` | 504 | |
| `const BASIC_WEAPON_IDS =` | 513 | |
| `const ITEMS = [` | 524 | |
| `function createRngStream(initialSeed)` | 540 | |
| `const terrainRNG = createRngStream(1)` | ≈564 | stream isolation site |
| `// === BEGIN SIMULATION PATH ===` | 584 | |
| `function detSin(x)` | ≈601 | |
| `class NetClient {` | 833 | |
| `class Terrain {` | 1137 | page-level heightmap class |
| `class Game {` | 1297 | |
| `setupInput() {` | 1370 | |
| `fireActiveWeapon() {` | 1421 | |
| `applyFireSync(msg) {` | 1480 | |
| `newRound(roundSeed) {` | 1734 | |
| `snapTanksToTerrain() {` | 1753 | |
| `grantRoundFuel(tank) {` | 1762 | |
| `driveTank(tank, dir, steps) {` | 1779 | |
| `teleportTank(tank, x) {` | 1807 | |
| `requestDrive(dir) {` | 1821 | |
| `requestTeleport() {` | 1838 | |
| `updateHUD() {` | 1880 | writes `#hud` |
| `start(config) {` | 2058 | roster construction |
| `nextTurn() {` | 2186 | |
| `checkAIShot() {` | 2212 | |
| `applyDamageToTank(tank, amount, shooter) {` | 2411 | **single damage entry point** |
| `explosion(x, y, radius, damage, shooterIdx, opts) {` | 2448 | |
| `reSeatTanks() {` | 2510 | |
| `onImpact(x, y, weapon, shooterIdx, proj) {` | 2578 | weapon-kind dispatch |
| `stepPhysics(dt) {` | 2754 | the ~550-line tick loop |
| `// === END SIMULATION PATH ===` | 3394 | |
| `handleRoundEnd() {` | 3481 | |
| `startNextRound() {` | 3532 | |
| `buy(tank, id, packs = 1) {` | 3570 | |
| `sell(tank, id, itemsToSell = 1) {` | 3596 | |
| `availableWeapons() {` | 3624 | |
| `showShopForPlayer(playerIdx, opts) {` | 3652 | writes `#shop` |
| `showMatchSummary() {` | 3947 | |
| `draw() {` | 4046 | canvas render |
| `function createHeadlessGame(opts = {})` | 4218 | |
| `const AI_PROFILES = [` | 4252 | |
| `const RETRO_COLORS = [` | 4259 | |
| `function escapeHtml(value)` | 4277 | |
| `function safeColour(value)` | 4290 | |
| `function renderLobbySlots(roomState) {` | 4294 | |
| `(YOU) ${isHost ? '👑' : ''}` | 4319 | **emoji to remove** |
| `PLAYER ${i + 1} ${isHost ? '👑' : ''}` | 4347 | **emoji to remove** |
| `globalThis.SCORCHED = {` | 4715 | public export |

Note `Terrain.draw(ctx)` (≈1236) sits **inside** the simulation fence. Canvas work there is
subject to the `Math.sin/cos/tan/hypot/atan2/pow/random` source guard even though it is
purely visual. Move it out of the fence in Phase 2.2 rather than fighting the guard.

### 0.3 In-flight work you will collide with

`git diff index.html` currently shows **64 uncommitted insertions** adding host/solo config
selects for `gravity`, `wind` (variability), `terrain-style`, `terrain-hills`,
`terrain-flatness`, threaded into `START_GAME.config` and `gameInstance.start(...)`.
Consequences you must respect:

- `Game.config` already carries `gravity`, `windVariability`, `terrainStyle`, `hillCount`,
  `flatness`. `Game.gravity` is already a getter (`config.gravity ?? CONST.GRAVITY`).
- `Terrain.generate(seed, config = {})` already forwards config to
  `lib/terrain.js:generateTerrain`, which already reads `config.terrainStyle`,
  `config.hillCount`, `config.flatness`.
- **Land or revert this change before starting Phase 0.** Do not start on top of a dirty tree.
- These five new `<select>` elements are new DOM ids the restyle must preserve.

---

## 1. Risk register — the five things that will break the 205-test suite

Read all five before writing any code. Every phase below is shaped by them.

### R1. Six independent copies of the `<script>` extraction regex

`/<script>([\s\S]*?)<\/script>/` appears in:

- `tests/helpers/browser-harness.js:17`
- `tests/helpers/headless-game.js:10`
- `tests/smoke.test.js:12`
- `tests/determinism.test.js:40` **and** `:83`
- `tests/game-determinism.test.js:9`
- `tests/weapon-registry.test.js:18`

Every test in the repo loads the game by string-slicing `index.html`. Therefore:

- **Adding a second attribute-less `<script>` block breaks all 205 tests simultaneously.**
- Adding `type="module"` or `defer` to the existing tag breaks all 205 tests.
- A literal `</script>` inside any new string (e.g. a copy string, an SVG sprite) truncates
  the extraction and breaks all 205 tests.
- Moving the tag above line 388 changes nothing; moving `lib/terrain.js` inline changes
  everything.

**Rule: `index.html` keeps exactly one attribute-less `<script>` block, forever.** All new
JS — the component kit, the sprite atlas, the copy table, the chassis registry — goes inside
it. Phase 0.1 makes this a tested invariant.

### R2. Three mutually incompatible DOM stand-ins

| Harness | `setAttribute` | id lookup | `querySelector` | `classList.contains` | CSS |
| --- | --- | --- | --- | --- | --- |
| `tests/helpers/browser-harness.js` | **absent → TypeError** | auto-vivifies any id | `null` except one literal selector | always `false` | none |
| `tests/smoke.test.js` (own mock) | present | **`null` unless pre-registered** (~35 ids hand-listed at :169–214) | selector-aware | real `Set` | none |
| `tests/helpers/headless-game.js` | n/a | `getElementById: () => null` | n/a | n/a | none |

None of them parse CSS. `getComputedStyle`, CSS custom properties, `offsetWidth`,
`document.fonts`, `FontFace`, `matchMedia` do not exist. `ctx.measureText(...)` returns a
Proxy whose `.width` is a *function*, so text metrics silently produce `NaN` geometry rather
than throwing. `requestAnimationFrame` and `setInterval` never invoke their callbacks.
`fetch`, `Image`, `Audio`, `URL`, `Blob`, `TextEncoder`, `structuredClone`, `crypto` are all
absent from the vm realm.

**Rule: no UI code may branch on measured layout, computed style, font metrics or class
membership.** All visual state must be driven by inline `style.*` assignment and
`textContent`, both of which every harness supports.

### R3. The design system is React + multi-file CSS; the game is neither

`components/**/*.jsx` import `react`. `styles.css` is seven `@import`s. There is no npm
install step, no bundler and no `node_modules` beyond `ws`. **Nothing from the design system
is consumed as code.** Tokens are copied verbatim as CSS text; components are re-expressed as
vanilla DOM factories with identical prop names (Phase 3). This is the core architectural
decision of the plan and it is not negotiable given the constraints.

### R4. Deploy-time assertions

`scripts/verify-deployed.mjs` greps the served page for:

- `display-share-code` (line 109)
- `this.toGame('applyFireSync'` and `applyFireSync(msg)` (line 112)

**Rule: the id `display-share-code` and the two `applyFireSync` strings survive verbatim.**
The live host re-clones on every wake, so a broken assertion here means a broken deploy gate,
not just a red test.

### R5. Duplicated constants with no drift guard

| Constant | Client | Server | Guarded? |
| --- | --- | --- | --- |
| `WEAPON_IDS` / `WEAPONS` | `index.html` `const WEAPONS = [` | `lib/constants.js:30` | **yes** — `tests/weapon-registry.test.js` |
| `BASIC_WEAPON_IDS` | `index.html` ≈513 | `lib/constants.js:50` | yes |
| `RETRO_COLORS` | `index.html` ≈4259 | `lib/constants.js:2` | **no** |
| `WORLD_W` | `CONST.WORLD_W` | `lib/constants.js:19` | **no** |

Every new shared table this plan adds (`CHASSIS`, `STRUCTURES`) gets a parity test modelled on
`weapon-registry.test.js` in the same commit that adds it. Non-negotiable.

---

## 2. Determinism doctrine

The game is deterministic lockstep. The server (`lib/room-manager.js`) is an **input relay,
not a simulator**: it owns the seed, the wind, the shot vector `vx`/`vy`, the teleport `x`,
the turn cursor and the round structure, and owns **no** tank, terrain, cash or inventory
state. Every gameplay rule is enforced only by clients reaching the same answer. A desync is
silent.

Six rules. Every phase below states which apply.

**D1 — All simulation randomness comes from a seeded stream.** `Math.random` appears zero
times in the repo today; it must stay that way. `visualRNG` is for cosmetics only and must
never influence a value that reaches `terrain.heights`, a tank field, or a structure field.
Proven by `tests/determinism.test.js:179` (source guard over the fence) and
`tests/determinism.test.js:33`.

**D2 — Never insert a draw; only append, or use a new stream.** `gameplayRNG` is a
positional stream. Inserting one `rng.next()` before an existing draw shifts every subsequent
value in the round and desyncs everything downstream. When a new system needs randomness,
**derive a dedicated stream from the round seed with a fixed XOR offset**, exactly as
`terrainRNG` and `gameplayRNG` are already separated:

```js
const structureRNG = createRngStream(1);   // seeded roundSeed ^ 0x5EED5701
const lootRNG      = createRngStream(1);   // seeded roundSeed ^ 0x5EED10A7
```

`tests/determinism.test.js:38` already proves the isolation pattern works ("byte-identical no
matter how many gameplay draws precede it"). Every new stream gets a mirror of that test.

**D3 — A weapon consumes a fixed number of draws.** `tests/game-determinism.test.js:123`
exists for this. `MIRV` splitting into 5 must always call `next()` the same number of times
regardless of terrain, hit outcome or tank count. Never `rng.int(3, 6)` for a sub-munition
count. Never `if (hitSomething) rng.next()`.

**D4 — No real-time in the sim.** `loop()` drives `update()` from `requestAnimationFrame`, so
two clients that joined at different times have executed a different number of ticks.
Anything that accumulates per tick outside a live projectile will desync immediately. New
per-turn effects are keyed to `TURN_SYNC.turnNumber` or `roundState.ticks` since the last
`FIRE_SYNC`, never to elapsed wall-clock.

**D5 — Iterate in a stable order.** Tanks iterate in `roster` index order (which is slot
order); structures iterate in array index order. `applyServerRoundStart` already re-draws
every `tank.x` in roster order for exactly this reason.

**D6 — Trig is `detSin`/`detCos`/`detTan` inside the fence.** `Math.sqrt` is exempt (IEEE-754
correctly rounded). `Math.sin/cos/tan/hypot/atan2/pow` are hard-banned inside 584–3394 by the
source guard.

### The replay gate

Phase 0.3 extracts `tests/game-determinism.test.js:runSimulation` into
`tests/helpers/replay.js` as:

```js
assertReplayIdentical(label, actions, { seed, players, wallType, hashExtra })
```

It runs the same scripted action list twice in two fresh vm realms and byte-compares
`Buffer.from(game.terrain.heights.buffer)` plus a state digest of tanks, structures and
status effects.

**Every phase from 8 onward adds at least one `assertReplayIdentical` case and the whole
replay suite is re-run at the end of every phase.** Not once at the end — after each system.

---

## 3. Phase overview

| # | Phase | Half | Risk | Commits |
| --- | --- | --- | --- | --- |
| 0 | Harness contract + replay gate | — | **critical** | 3 |
| 1 | Design-adherence lint gate (ratchet) | A | low | 2 |
| 2 | No-op geometry & render extraction refactor | B-prep | **highest** | 2 |
| 3 | Token block + font loading | A | med | 1 |
| 4 | Vanilla component kit (`AC.*`) | A | med | 2 |
| 5 | Copy table + voice pass, emoji removal | A | med | 2 |
| 6 | Re-skin: landing, lobby, HUD, forge, standings | A | med | 5 |
| 7 | Canvas re-skin + kill feed + damage numbers | A | med | 3 |
| 8 | Chassis registry (data only, one chassis) | B | med | 1 |
| 9 | Chassis movement models | B | **high** | 3 |
| 10 | Chassis selection over the wire | B | high | 2 |
| 11 | Structures: the thing you defend | B | **high** | 3 |
| 12 | Active defenses | B | **highest** | 3 |
| 13 | Ordnance: beams and hitscan | B | med | 2 |
| 14 | Ordnance: sub-munition and terrain | B | med | 2 |
| 15 | Ordnance: status effects | B | **high** | 2 |
| 16 | Aether-Forge crafting and meta | B | low | 2 |

**Why this order.** Phase 0 and 1 are pure risk mitigation and everything depends on them.
Phase 2 is the single highest-risk change in the plan — making tank geometry table-driven
touches collision AABBs and damage falloff, which every physics test depends on — so it is
done *first*, while the file is otherwise untouched and the 205-test suite is a clean oracle
for "this must be a byte-identical no-op". After that the visual half lands (low sim risk,
100% of the day-one player-visible value), then the content half in ascending desync risk.

---

# HALF A — the visual system

---

## Phase 0 — Harness contract and replay gate

*No player-visible change. Nothing below is safe without this.*

### 0.1 — Single-source the script extraction, and make one-script-block an invariant

**What.** Create `tests/helpers/extract-script.js` exporting
`extractGameScript(htmlPath = <repo>/index.html)`. It asserts the file contains **exactly
one** attribute-less `<script>` tag, throws a named error otherwise, and returns the body.
Re-point all six call sites at it.

**Files.**
- new `tests/helpers/extract-script.js`
- `tests/helpers/browser-harness.js:17`, `tests/helpers/headless-game.js:10`,
  `tests/smoke.test.js:12`, `tests/determinism.test.js:40` and `:83`,
  `tests/game-determinism.test.js:9`, `tests/weapon-registry.test.js:18`
  *(grep `<script>([\\s\\S]` to find them all)*

**Determinism.** None (test infrastructure).

**Test.** New `tests/page-structure.test.js`:
- `'index.html contains exactly one inline script block'`
- `'the inline script block contains no literal </script> sequence'`
- `'the extracted script is over 100 kB'` (catches a truncating regex)
- `'lib/terrain.js is loaded by a src script tag before the inline block'`
- `'the deploy gate strings survive'` — asserts the served markup still contains
  `display-share-code`, `this.toGame('applyFireSync'` and `applyFireSync(msg)`
  (mirrors `scripts/verify-deployed.mjs:109,112` so a rename fails in CI, not in production).

**Assumption.** All six regexes are byte-identical today; a mechanical replace is safe.

### 0.2 — Raise the browser-harness DOM to a documented contract

**What.** `tests/helpers/browser-harness.js` `makeEl` (:31–66) is missing what real component
code needs. Add, and only add: `setAttribute` / `getAttribute` (backed by an attrs map),
`dataset` (plain object), a real `classList` backed by a `Set` (`contains` currently returns
a hardcoded `false`, which silently selects the wrong branch), `remove()`, `insertBefore`,
`replaceChildren`, `parentNode` wiring in `appendChild`, and `dispatchEvent`. Make
`document.querySelector`/`querySelectorAll` walk the constructed tree by id, tag and class
instead of returning a memoised blank input for every selector (:55–59) — that memoised fake
is worse than a failure because it feeds empty strings into `SET_PROFILE`.

**Files.** `tests/helpers/browser-harness.js` `function makeEl(tag, id)` and
`function createBrowserDom()`.

**Determinism.** None.

**Test.** New `tests/dom-contract.test.js` asserting each capability, plus the whole existing
suite must stay at 203 pass / 2 skip. **Do not** merge `smoke.test.js`'s own mock into this
one in the same commit — it has different id-registration semantics (`null` for unregistered
ids) and several tests depend on that. Leave it alone; note the divergence in a comment.

**Assumption.** `classList.contains → false` is not load-bearing for any current test. Verify
by running the suite; if something goes red, that test was relying on a bug.

### 0.3 — Extract the replay gate

**What.** Move `tests/game-determinism.test.js:35 runSimulation(actions)` into
`tests/helpers/replay.js` and generalise:

```js
// tests/helpers/replay.js
function runSimulation({ seed = 12345, players, wallType = 'rubber', startingCash = 10000,
                         actions = [], ticks = 5000, digest }) → { heights: Buffer, state: string }
function assertReplayIdentical(t, label, opts)   // runs twice, byte-compares both fields
```

`digest(game)` defaults to `roster.map(t => \`${t.slot}:${t.x}:${t.y}:${t.hp}\`).join('|')`
and is **extended by later phases** to cover structures and status effects. Keep the existing
three test cases in `game-determinism.test.js` calling the new helper with identical
assertions so the diff is provably behaviour-neutral.

**Determinism.** This *is* the determinism proof. Actions keyed to `game.roundState.ticks`,
fixed `dt = 0.016`, fresh vm realm per run so no state leaks.

**Test.** `tests/game-determinism.test.js` unchanged in behaviour: still three passing tests.

**Assumption.** A fresh vm realm per run costs ~150 ms; the CI job cap is 5 minutes and the
suite currently finishes well inside it. Budget: each later phase adds at most **two** replay
cases. If the suite passes 4 minutes, split the replay tests into their own workflow job
rather than raising `timeout-minutes`.

---

## Phase 1 — Design-adherence lint gate

The brief requires `_adherence.oxlintrc.json` to be wired in so violations **fail** rather
than drift. Its 31 `no-restricted-syntax` selectors are JSX/React-shaped. Here is exactly
what ports.

### 1.1 — Rule port analysis

| # | Rule (from `_adherence.oxlintrc.json`) | Ports? | How |
| --- | --- | --- | --- |
| 1 | `Literal[value=/#[0-9a-fA-F]{3,8}\b/]` — raw hex colour | **YES, fully** | The selector matches any string literal in any JS. Enforce by scanning the extracted script + the `<style>` block for `#rrggbb` outside the token block. |
| 2 | `Literal[value=/\b\d+px\b/]` — raw px | **YES, with a carve-out** | Enforce over CSS and over DOM-styling string literals. **Carve-out: canvas geometry is not CSS.** `fillRect(x-8, y-6, 16, 6)` is world units, not px, and must not be tokenised. Scope the rule to the styled surface (the `<style>` block + `AC.*` factories + `updateHUD`/shop/lobby builders), not to `draw()` or the sim path. |
| 3 | `Literal[value=/font-family\s*:\s*(?!Uncial Antiqua\|Cinzel\|Spectral\|Share Tech Mono)/i]` | **YES, fully** | Plus a stronger positive form: every `font`/`font-family` declaration must resolve to one of `--font-display`, `--font-heading`, `--font-body`, `--font-mono`. |
| 4–28 | `JSXOpeningElement[name.name='X'] > JSXAttribute…` prop allowlists for `Badge`, `Button`, `HudReadout`, `HudPlayer`, `IconButton`, `IconTile`, `Input`, `LobbySlot`, `Modal`, `Panel`, `RadioGroup`, `Switch`, `WeaponCard`… | **NO — cannot port** | There are no JSX elements and there is no JSX parser in the toolchain. **The intent ports** as a runtime contract: each `AC.*` factory validates its options object against a declared `props` allowlist and a per-prop enum, and throws in the dev path. See 1.3. |
| 29 | `react/forbid-elements` with `forbid: []` | **NO — it is a no-op** | Empty forbid list; nothing to enforce. |
| 30 | `no-restricted-imports` for `components/**` deep imports | **NO — genuinely N/A** | Single file, zero imports. |
| — | `x-omelette.tokens` (224 token names + `tokenKinds`) | **YES, and it is the most valuable part** | Use it as the authoritative token allowlist: every `var(--x)` in `index.html` must name a token that exists in the copied token block, and the token block must be a superset of the 224 names. Catches typo'd tokens, which CSS fails silently on. |

### 1.2 — `tools/design-lint.js` + `npm run lint:design` + a ratchet

**What.** A dependency-free Node script (`node tools/design-lint.js`) that reads
`index.html`, splits it into three regions, and applies region-scoped rules:

| Region | Delimited by | Rules applied |
| --- | --- | --- |
| **TOKENS** | `/* AC-TOKENS-BEGIN */` … `/* AC-TOKENS-END */` inside `<style>` | exempt from rules 1–3 (this is where the literals live); must define ⊇ the 224 names in `x-omelette.tokens` |
| **STYLED** | rest of `<style>`, plus the script between `// === AC-UI-BEGIN ===` and `// === AC-UI-END ===` (the component kit + all DOM builders) | rules 1, 2, 3, token-existence, radius ≤ `2px` on controls, no emoji, copy rules |
| **SIM** | everything else | exempt from 1–3; the existing determinism source guard already polices it |

Output is a JSON report and a non-zero exit on regression.

**The ratchet.** The gate must land **green on the current file**, or Phase 1 blocks Phase 3.
So `tools/design-lint.js` compares against `tools/design-lint-baseline.json`, a committed
`{ rule: count }` map. It fails if any count **increases**. Each subsequent phase drives
counts down and updates the baseline in the same commit. By the end of Phase 7 the baseline
is all zeros and the ratchet becomes an absolute gate.

**Files.** new `tools/design-lint.js`, new `tools/design-lint-baseline.json`,
`package.json` `"scripts"` → add `"lint:design": "node tools/design-lint.js"`.

**Determinism.** None.

**Test.** New `tests/design-adherence.test.js` — runs the same checker module in-process and
fails the build. This is what makes it a *gate*: CI runs `npm test`, not `npm run lint:design`,
so the rule must live in a test file. Test names:
- `'no raw hex colours in the styled surface'`
- `'no raw px literals in the styled surface'`
- `'every font declaration uses one of the four design-system families'`
- `'every var(--token) reference names a token defined in the token block'`
- `'the token block defines every token in the design system manifest'`
- `'no control declares a border-radius above --radius-plate'`
- `'no emoji anywhere in index.html'`
- `'design-lint violation counts never exceed the committed baseline'`

**Assumption.** oxlint itself is *not* installed. Installing it would add a devDependency, an
`npm ci` cost on every CI run, and a JSX parse of files the game does not contain, in exchange
for three portable rules. **Judgement call: reimplement the three portable rules in ~150 lines
of Node rather than take the dependency.** Record the mapping in a comment header in
`tools/design-lint.js` citing `_adherence.oxlintrc.json` rule indices so the provenance is
traceable.

### 1.3 — Runtime prop contracts (the JSX allowlists, ported)

**What.** Each `AC.*` factory (Phase 4) declares `AC.Button.props = ['variant','size','block',
'disabled','icon','children','style']` and `AC.Button.enums = { variant: [...], size: [...] }`,
taken verbatim from the oxlint selectors. A shared `AC._check(name, opts)` throws
`AC: <Button> does not accept prop "colour"` on an unknown key or an out-of-enum value.

**Determinism.** None — the kit is outside the fence and guarded by `typeof document`.

**Test.** `tests/design-adherence.test.js`:
- `'every AC component declares a props allowlist matching the design system'` — asserts the
  allowlists equal the prop lists parsed out of `_adherence.oxlintrc.json`, so the two cannot
  drift.
- `'AC.Button rejects an unknown prop'` / `'AC.Badge rejects an out-of-enum tone'`

---

## Phase 2 — No-op geometry and render extraction

**The highest-risk commit in the plan. It must produce byte-identical simulation output.**

### 2.1 — Table-drive tank geometry

**What.** Tank dimensions are hardcoded in four places and must become one table so Phase 9
can vary them per chassis. Introduce, just above `class Game {`:

```js
const CHASSIS_GEOMETRY = {
  'clockwork-tank': { halfW: 8, hullH: 6, domeR: 4, barrelLen: 12, centreY: 3 }
};
function geomFor(tank) { return CHASSIS_GEOMETRY[tank.chassis] || CHASSIS_GEOMETRY['clockwork-tank']; }
```

Replace the literals at:
- **`stepPhysics`** tank-hull AABB — grep `proj.x >= tank.x - 8` (the `± 8` collision box)
- **`explosion`** damage reference point — grep `tank.y - 3` inside
  `explosion(x, y, radius, damage, shooterIdx, opts) {`
- **`draw()`** hull/dome/barrel — grep `fillRect(` and `arc(` inside `draw() {`
- **`driveTank`** — `CONST.DRIVE_STEP` / `CONST.MAX_CLIMB` become `g.driveStep` / `g.maxClimb`
  defaulted from `CONST`

**Determinism (D5, D6).** No new randomness. `geomFor` is a pure table lookup; the defaults
are the exact current constants, so every float in the simulation is unchanged. Chassis is
`undefined` on every tank at this point, so the fallback always fires.

**Test.**
- The entire existing 205-test suite must stay green **with zero assertion edits**. If a
  damage or position assertion needs a new expected value, the refactor is wrong — revert and
  re-derive.
- `assertReplayIdentical` over the existing three action scripts.
- New `tests/chassis.test.js` seed: `'geomFor falls back to clockwork-tank for an unknown chassis'`.

**Assumption.** The `± 8` half-width and `tank.y - 3` centre are the *only* two hardcoded tank
dimensions inside the fence. Verify with `grep -n '\- 8\|\- 3\|\- 6' index.html` restricted to
584–3394 before declaring the refactor complete.

### 2.2 — Move `Terrain.draw` out of the simulation fence

**What.** `Terrain.draw(ctx)` currently sits inside `class Terrain`, which is inside
584–3394, so it is bound by the "no `Math.sin`" source guard for no reason. Phase 7 will want
gradients and curves there. Move the method body to a free function
`drawTerrain(ctx, terrain, biome)` defined **after** `// === END SIMULATION PATH ===`, and
leave `Terrain.prototype.draw` as a one-line delegate. Same for `drawParticles` /
`drawExplosions` if any remain inside (verify with grep).

**Determinism.** Zero — rendering never feeds simulation state. Confirms the fence boundary is
honest rather than accidental.

**Test.** `tests/determinism.test.js:179` source guard still passes; `smoke.test.js:314`
(`'One updateHUD() call followed by one draw() call completes without throwing'`) still passes.

**Assumption.** Nothing calls `terrain.draw` from inside the fence. Verify by grep.

---

## Phase 3 — Token block and font loading

### 3.1 — Replace `<style>` wholesale

**What.** Delete lines 8–210 (the DOS `#00ff00` Courier stylesheet) and write in their place:

1. `/* AC-TOKENS-BEGIN */` … `/* AC-TOKENS-END */` — the seven token files concatenated
   **verbatim**, in `styles.css` import order, minus the `@import` of Google Fonts:
   `tokens/colors.css`, `tokens/typography.css`, `tokens/spacing.css`, `tokens/effects.css`,
   `tokens/motion.css`, then `tokens/base.css`. All 224 custom properties, byte-identical
   hex values. The five brand anchors (`#4A413C`, `#D5007F`, `#4B0082`, `#00BFFF`, `#B5A642`)
   come across untouched.
   - Drop `--sheet-core-loop` / `--sheet-cataclysm` / `--sheet-arsenal` (relative `url()`s to
     7 MB PNGs outside the served root). Keep the token *names* defined as `none` so the
     token-existence lint stays satisfied and the manifest superset test passes.
2. The three utility classes from `tokens/typography.css`: `.ac-banner`, `.ac-label`,
   `.ac-readout`.
3. `@keyframes ac-aether-pulse | ac-turn-sweep | ac-gear-spin | ac-toast-in | ac-charge` and
   the `@media (prefers-reduced-motion: reduce)` block that collapses everything to `1ms`,
   copied verbatim from `tokens/motion.css`.
4. Layout rules for the existing structural ids, rewritten in tokens:
   `html, body`, `#hud` (`height: var(--hud-height)`), `#game`, `#setup`, `#shop`,
   `.setup-container`, `.form-group`, `.player-row`, `.settings-grid`, `.checkbox-group`,
   `.error-msg`, `#start-btn`. **Every existing selector keeps its name.**

In `<head>`, before `<style>`:

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Uncial+Antiqua&family=Cinzel:wght@400..900&family=Spectral:ital,wght@0,300;0,400;0,600;0,800;1,400&family=Share+Tech+Mono&display=swap">
```

`<link>` rather than the design system's `@import` — `@import` inside `<style>` serialises
against first paint. `display=swap` plus the fallback stacks already baked into
`--font-display` (`'Papyrus', serif`), `--font-heading` (`'Trajan Pro', Georgia, serif`),
`--font-body` (`Georgia, 'Times New Roman', serif`) and `--font-mono`
(`ui-monospace, 'Courier New', monospace`) mean a blocked CDN degrades legibly rather than
breaking layout.

**Deployment.** `server.js:81–92` serves `.html` with `Cache-Control: no-cache` and everything
else with `max-age=3600`; the font `<link>` is an absolute cross-origin URL and is unaffected
by the static server. No CSP header is emitted, so no allowlist change is needed. **If a CSP
is ever added, `fonts.googleapis.com` (style-src) and `fonts.gstatic.com` (font-src) must be
on it.**

**Harness.** None of the three DOM stand-ins parse `<style>` or `<link>`; the extraction regex
only takes the `<script>` body. **Zero test impact — verify, do not assume.**

**Determinism.** None. CSS cannot reach the simulation.

**Test.**
- `tests/design-adherence.test.js` new cases: `'the token block defines every token in the
  design system manifest'`, `'the fonts link names exactly the four design-system families'`.
- `tests/page-structure.test.js`: `'the stylesheet is a single style block bounded by the
  AC-TOKENS markers'`.
- Full suite green.

**Assumption.** Nothing in the tests asserts on a CSS rule. The one place a test could is
`renderLobbySlots` setting `style.borderColor` inline — that is JS, not CSS, and is preserved.

---

## Phase 4 — The vanilla component kit

### 4.1 — `AC.*` factories

**What.** Inside the one `<script>`, between `// === AC-UI-BEGIN ===` and
`// === AC-UI-END ===`, placed **after** `// === END SIMULATION PATH ===` and **before**
`function createHeadlessGame`, add a plain object `AC` of DOM factories that mirror the JSX
components prop-for-prop. Each returns an `HTMLElement`; each is a no-op returning `null`
when `typeof document === 'undefined'`.

| `AC` factory | Mirrors | Notes for the vanilla port |
| --- | --- | --- |
| `AC.Button(o)` | `components/core/Button.jsx` | `KIND`/`SIZE` maps copied verbatim; hover/press handled by `mouseenter`/`mousedown` listeners writing `style.boxShadow`/`style.transform` (React state has no equivalent) |
| `AC.IconButton(o)` | `core/IconButton.jsx` | |
| `AC.Input(o)` / `AC.Select(o)` | `core/Input.jsx` | focus ring via `focus`/`blur` listeners |
| `AC.RadioGroup(o)` / `AC.Switch(o)` | `core/RadioGroup.jsx` | **must keep `<input type="radio" name="weapon-availability">`** — `smoke.test.js` and the lobby read it via the literal selector `input[name="weapon-availability"]:checked` |
| `AC.Panel(o)` / `AC.SectionBanner(o)` | `core/Panel.jsx` | |
| `AC.Badge(o)` / `AC.ShareCodeChip(o)` | `core/Badge.jsx` | ShareCodeChip must render `id="display-share-code"` on the code element (R4) |
| `AC.IconTile(o)` | `core/IconTile.jsx` | port `SPRITES` and `abbrev()` **verbatim** — the initials placeholder is the sanctioned fallback until per-sprite PNGs exist |
| `AC.HudReadout(o)` / `AC.HpBar(o)` / `AC.WindGauge(o)` | `hud/HudReadout.jsx` | |
| `AC.HudStrip(o)` / `AC.WeaponSelector(o)` | `hud/HudStrip.jsx`, `hud/WeaponSelector.jsx` | |
| `AC.TurnBanner(o)` / `AC.KillFeedToast(o)` | `hud/TurnBanner.jsx` | |
| `AC.WeaponCard(o)` / `AC.ShopRow(o)` | `match/WeaponCard.jsx` | |
| `AC.LobbySlot(o)` / `AC.RoomListRow(o)` / `AC.StandingsRow(o)` | `match/LobbySlot.jsx` | |
| `AC.Modal(o)` | `match/Modal.jsx` | |

Implementation rules, derived from R2:
- Build with `document.createElement` + `appendChild` + `textContent`. **Never `innerHTML`**
  in the kit — the browser harness's `innerHTML` setter stores the string and clears children
  without parsing, so any component built by string would be structurally invisible to tests.
- Never read `getComputedStyle`, `offsetWidth`, `classList.contains`, or `measureText`.
- `className` assignment only, for the three `.ac-*` utility classes.
- Values that a player reads as a number get `class="ac-readout"` — that is what carries
  `font-variant-numeric: tabular-nums`. This applies to **angle, power, cash, HP, share code,
  ammo counts, wind magnitude, round numbers, timers, blast, damage, pack size, prices**.

**Determinism.** The kit is outside the fence, guarded by `typeof document`. It must not read
or write any simulation field; it renders arguments only.

**Test.** New `tests/ac-components.test.js`, running under the Phase 0.2 DOM contract:
- `'every AC factory returns null when document is undefined'`
- `'AC.Button renders a Cinzel uppercase label with radius --radius-plate'`
- `'AC.HudReadout applies ac-readout to the value node'`
- `'AC.IconTile falls back to initials for a sprite with no src'`
- `'AC.ShareCodeChip renders the element id display-share-code'`
- `'AC exposes a factory for every component named in the design system manifest'` — reads
  `_ds_manifest.json` and fails when a component is missed.

**Assumption.** `_ds_manifest.json` lists the same component set as the `components/` tree.
Cross-check both before writing the test; the readme index lists `Select`, `Switch`,
`SectionBanner`, `HpBar`, `WindGauge`, `KillFeedToast`, `ShopRow`, `RoomListRow`,
`StandingsRow`, `ShareCodeChip` which are **co-located inside sibling files**, not separate
ones.

### 4.2 — Sprite manifest and the tier map

**What.** Port `SPRITES` from `components/core/IconTile.jsx` verbatim as `const AC_SPRITES`,
plus `AC_SPRITE_KEYS`. Add `const AC_TIER = { 1:'brass', 2:'cyan', 3:'magenta', 4:'violet' }`
matching `Badge.jsx`'s `TIER_TONE`.

**Finding to record in the commit message.** `readme.md:76` says the manifest is "37 names".
`Object.values(SPRITES).flat().length` is actually **44** (vehicles 10, ordnance 12, weapons 6,
defenses 7, structures 3, meta 6). The brief also says 37. **Treat 44 as authoritative** — it
is the executable value — and note the doc discrepancy.

**Test.** `tests/ac-components.test.js`: `'AC_SPRITE_KEYS matches the design system sprite
manifest exactly'` — parses `IconTile.jsx` and diffs, so the two cannot drift.

---

## Phase 5 — Copy table and voice

### 5.1 — `AC_COPY`, the single source of player-facing English

**What.** Every player-facing string moves into one frozen object near `const AC_SPRITES`:

```js
const AC_COPY = Object.freeze({
  wordmark: 'Æthercastle', wordmarkSub: 'Armored Alchemists',
  landing: { createPrivate: 'Create private siege', createPublic: 'Open the gates — public siege',
             join: 'Join', joinLabel: 'Join by code', solo: 'Drill yard — solo vs AI',
             publicSieges: 'Public sieges', refresh: 'Refresh', noOneAround: 'No one around' },
  lobby:   { shareCode: 'Share code', host: 'Host', you: 'You', ai: 'AI',
             seatOpen: 'Seat open — awaiting a commander', ready: 'Ready',
             standingBy: 'Standing by', disconnected: 'Disconnected',
             waitingForHost: 'The host has not opened the field yet' },
  hud:     { angle: 'Angle', power: 'Power', cash: 'Purse', wind: 'Wind', fuel: 'Fuel',
             ordnance: 'Ordnance', hull: 'Hull', net: 'Net',
             legend: 'L/R Angle · U/D Power · A/D Drive · T Teleport · Space Fire · [ ] Ordnance · Shift Coarse' },
  forge:   { title: 'Aether Forge', kicker: n => `Intermission · Round ${n.round} of ${n.total}`,
             buy: 'Forge', short: 'Short', sell: 'Sell salvage',
             done: 'Return to the field', purse: 'Purse' },
  feed:    { struck: 'struck', buried: 'buried', obliterated: 'obliterated',
             shielded: 'shielded', salvaged: 'salvaged', repaired: 'repaired',
             breached: 'breached', toppled: 'toppled' },
  errors:  { unknownRoom: 'No keep answers to that code',
             roomFull: 'That keep is at full garrison', … }
});
```

**Rules encoded, from `readme.md:36–46`:**
- Second person, never first person, never fake-archaic.
- Titles and banners UPPER CASE — applied by `text-transform` in `.ac-banner` / `.ac-label`,
  **not** by writing shouty source strings. Store sentence case; let CSS do the shouting.
- Compound nouns hyphenated with `Aether-` / `Clockwork-` / `Void-` prefixes.
- Item descriptions: one sentence, effect first.
- Kill-feed verbs past tense and understated.
- **No emoji.** No `!`.
- British-leaning prose spelling; the product name keeps "Armored".

**Test.** `tests/design-adherence.test.js`:
- `'AC_COPY contains no emoji'` (regex over the extended-pictographic ranges)
- `'AC_COPY contains no exclamation mark'`
- `'kill-feed verbs are past tense'` — allowlist assertion against the eight sanctioned verbs
- `'no player-facing string literal exists outside AC_COPY'` — scans the STYLED region for
  string literals matching `/^[A-Z][a-z].{4,}/` that are not `AC_COPY` values. This is the
  rule that actually stops drift; expect to allowlist a handful of legitimate exceptions
  (element ids, CSS values) explicitly rather than loosening the regex.

**Assumption.** Every current user string is reachable from `updateHUD`,
`showShopForPlayer`, `showMatchSummary`, `showWaitingForPlayers`, `renderLobbySlots`,
`renderSoloAiList`, `NET_ERROR_TEXT` and the static markup in `<body>`. Enumerate them by
grep before writing `AC_COPY`; a missed one fails the last test above, which is the point.

### 5.2 — Kill the crown, rename in display space only

**What.**
- Replace both `${isHost ? '👑' : ''}` occurrences (grep `👑`) with an `AC.Badge({ tone:
  'brass', children: AC_COPY.lobby.host })` node appended to the header row.
- `<title>` → `Æthercastle: Armored Alchemists`; `#setup-title` likewise.
- **Weapons and items get a `displayName`, and keep their `id`.** Add
  `displayName: 'Steam Mortar'` to `{ id: 'Baby Missile', … }` and so on, using the
  translations in `ui_kits/aethercastle/data.jsx` (Baby Missile → Steam Mortar, Missile →
  Alchemical Shell, Meganuke → Aether-Nuke, Roller → Clockwork Harpoon, Napalm → Acid Rounds,
  Laser → Tesla Coil Cannon, Death's Head → Void Bomb, Nuke → Aether-Strike Missile,
  Sandstorm keeps its name, …).

**Why not rename the ids.** The `id` is the wire value in `FIRE_SYNC.weapon`, the key in
`lib/constants.js:WEAPON_IDS`, the server's `KNOWN_WEAPONS` set, the shop inventory key and
the downgrade fallback `'Baby Missile'` at `lib/room-manager.js:662`. Renaming ids means a
lockstep-breaking protocol change, a `weapon-registry.test.js` rewrite and a server deploy in
the same commit as a cosmetic change. **Judgement call: ids are protocol, names are copy.
Never conflate them.** The same rule applies to `SHIELD_TYPES` keys and `ITEMS` ids.

**Determinism.** `displayName` is never read inside the fence. Prove it: the design-lint
STYLED-region scan is the enforcement.

**Test.**
- `tests/weapon-registry.test.js` unchanged and still green — this is the proof the rename is
  display-only.
- New `tests/design-adherence.test.js` case: `'every WEAPONS and ITEMS entry has a
  displayName'` and `'no displayName is referenced inside the simulation path'`.
- `'no emoji anywhere in index.html'` now passes for real.

---

## Phase 6 — Re-skin the DOM surfaces

Five commits, one per surface. **Every commit preserves every element id.** The ids the tests
and the deploy gate drive are:
`hud`, `game`, `setup`, `setup-title`, `landing-view`, `solo-view`, `lobby-view`, `shop`,
`error-msg`, `btn-create-match`, `btn-create-public`, `btn-join-match`, `join-code`,
`btn-refresh-rooms`, `room-list`, `btn-play-solo`, `btn-start-solo`, `btn-solo-back`,
`solo-name`, `solo-ai-count`, `solo-ai-list`, `solo-rounds`, `solo-cash`, `solo-wall-type`,
`solo-weapons`, `solo-gravity`, `solo-wind`, `solo-terrain-style`, `solo-terrain-hills`,
`solo-terrain-flatness`, `display-share-code`, `multiplayer-slots`, `host-settings`, `rounds`,
`starting-cash`, `wall-type`, `gravity`, `wind`, `terrain-style`, `terrain-hills`,
`terrain-flatness`, `client-waiting`, `start-btn`, and the radio group name
`weapon-availability`.

### 6.1 — Landing / matchmaking
**Anchor.** `<div id="landing-view">` in `<body>`; the `AC` rebuild happens in the
`DOMContentLoaded` block (grep `btn-create-match`).
**What.** Uncial wordmark (magenta, `--glow-text-magenta`), `SectionBanner`, a brass `Panel`
holding `Button variant="primary"` (create private), `secondary` (public), an `Input code`
+ `plate` Join, and a `ghost` solo button. Public-room list becomes `AC.RoomListRow`.
**Test.** `browser-lockstep.test.js:39` still drives `btn-create-match`/`join-code`/
`btn-join-match` by `.click()` and `.value`; `:165` and `:182` still read `#error-msg` for
`/no room|exist|not found/i` and `/invalid/i` — **update `NET_ERROR_TEXT` copy carefully or
update those two regexes in the same commit**. New case in `tests/ac-components.test.js`:
`'the landing view exposes every id the harness drives'`.

### 6.2 — Lobby
**Anchor.** `function renderLobbySlots(roomState) {`
**What.** `AC.ShareCodeChip` (carries `display-share-code`), four `AC.LobbySlot`s, brass
`Host` badge, cyan `You` badge, violet `AI` badge, `1px dashed --stone-500` empty seat,
`--slot-height: 76px`. Host settings become `AC.Select` / `AC.Input` / `AC.RadioGroup`.
**Harness note.** `renderLobbySlots` currently builds by template string; `smoke.test.js`'s
mock DOM *synthesises* `.player-name` / `.player-type` / `.player-color` children when
`.player-row` innerHTML is set (`smoke.test.js:119–141`). Rebuilding with `createElement`
makes those children real and the synthesis inert — **verify `smoke.test.js` still passes and
do not delete the synthesis** (other tests may lean on it).
**Test.** `browser-lockstep.test.js` `multiplayer-slots.children.length >= 2` still holds —
`AC.LobbySlot` must be appended as a direct child, not wrapped in a fragment.

### 6.3 — HUD strip and turn banner
**Anchor.** `updateHUD() {`
**What.** Replace the ten lazily-created `<span>`s with `AC.HudStrip`. Keep the "build once,
then only set `.textContent`" discipline — it is why the HUD does not thrash. Add
`AC.TurnBanner` as a new 44px element directly under `#hud`, driven from `applyTurnSync` and
`nextTurn`. Wind uses `AC.WindGauge` with `▶ ◀`, magnitude in `ac-readout`.
**Determinism.** `updateHUD` returns early when `this.headless`; keep that guard as the
*first* statement, and add `|| typeof document === 'undefined'` (currently missing — see 6.6).
**Test.** `smoke.test.js:314` still green. New: `'the HUD renders angle, power, cash and HP in
tabular-nums readouts'`.

### 6.4 — Shop → Aether Forge
**Anchor.** `showShopForPlayer(playerIdx, opts) {` (≈295 lines of DOM)
**What.** `AC.Modal surface="parchment"` titled per `AC_COPY.forge`, a featured
`AC.WeaponCard` rail for tier 3–4, two `AC.ShopRow` columns (Ordnance / Defenses & utility),
the existing ×1/×5/×10 bulk multiplier as `AC.Button size="sm"`, `Forge`/`Short` buy states,
and the existing sell path as `Sell salvage`. Unaffordable rows stay visible with a
`--blood-500` price and a `ghost` action, per `readme.md:64`.
**Test.** `tests/shop.test.js` (headless, no DOM) untouched and green — it exercises
`buy`/`sell` directly. `smoke.test.js` shop tests: check whether any read shop DOM; if so,
update selectors in the same commit.

### 6.5 — Match summary → Standings
**Anchor.** `showMatchSummary() {`
**What.** `AC.StandingsRow` ranked list with gilded rank plates for 1–3, an `AC.Panel
surface="parchment"` guild ledger, `Rematch` (primary) and `Back to lobby` (ghost).
**Test.** `smoke.test.js` `'Online Mode handleRoundEnd tests'` (:1867, :1906, :1937) assert
`showMatchSummary` is/isn't *called* — they spy on the method, not its DOM. Should be safe;
confirm.

### 6.6 — Harden the two unguarded DOM sites (fold into 6.3)
`showNetError(err)` (grep `showNetError`) touches
`document.getElementById('error-msg')` with **no `headless` and no `typeof document` guard**.
It is unreachable today only because `net.onError` is wired only in online mode. Phase 12
adds server-driven structure events which could reach it headlessly. Add
`if (this.headless || typeof document === 'undefined') return;` as the first line.
`updateHUD` has the same latent gap (`headless` only, no `typeof document`).
**Test.** New `tests/headless-safety.test.js`: `'every DOM-touching Game method returns early
in a document-less realm'` — constructs a headless game under `headless-game.js` and calls
`updateHUD`, `draw`, `showShopForPlayer`, `showMatchSummary`, `showWaitingForPlayers`,
`showNetError` in turn, asserting no throw.

---

## Phase 7 — Canvas re-skin

Canvas is explicitly in scope. All of this lives **after** `// === END SIMULATION PATH ===`
following Phase 2.2, so it is exempt from the trig source guard but still must not read or
write simulation state.

### 7.1 — Biome terrain silhouette
**Anchor.** `drawTerrain(ctx, terrain, biome)` (created in 2.2).
**What.** Replace the eight hardcoded biome gradient stops (grep `#001a33`, `#002200`,
`#331a00`, `#020010` for sky; `#888888`, `#226622`, `#cc8844`, `#5a3d28` for ground) with the
twelve biome tokens from `tokens/colors.css`:

| Biome | sky | crust | core |
| --- | --- | --- | --- |
| mountains | `#0B1B2E` | `#8A8F98` | `#1C1E22` |
| plains | `#0A1C10` | `#3E7A33` | `#0A2410` |
| plateau | `#2B1606` | `#C98A46` | `#5A3A1C` |
| hills | `#0A0616` | `#6A4A30` | `#1C1208` |

Structure per `readme.md:56` and `BattleScreen.jsx`: near-black `--void-900` field, biome sky
gradient behind the terrain, **flat clipped silhouette with a lighter crust band (top ~8px)
and a dark core**, a magenta ground-glow
(`radial-gradient(120% 80% at 50% 100%, rgba(213,0,127,.10), transparent 60%)` expressed as a
canvas radial gradient), and the 3px scanline as the **only** texture. The `#2d8a2d` surface
stroke becomes the crust band.

**Canvas reads tokens how?** `getComputedStyle` does not exist in the harness (R2). So the
biome ramps are duplicated as a JS table `AC_BIOME = { mountains: { sky, crust, core }, … }`
next to `AC_SPRITES`, with the same hex values. **This is a deliberate second copy** — a
`tests/design-adherence.test.js` case `'AC_BIOME matches the biome tokens in the token block'`
parses both and diffs, so it cannot drift. This is the only sanctioned hex duplication in the
file and the design-lint TOKENS exemption must cover it explicitly.

**Determinism.** None — the fourth biome `hills` already exists in `lib/terrain.js:26–31` but
falls through to the generic branch in the current renderer. Adding its ramp changes pixels
only. `Terrain.generate` is untouched.

**Test.** `smoke.test.js:314` (`draw()` does not throw). New `tests/canvas-render.test.js`:
`'drawTerrain uses only AC_BIOME colours'` (a recording ctx that captures every `fillStyle` /
`strokeStyle` assignment and asserts membership), `'each of the four biomes has a sky, crust
and core ramp'`.

### 7.2 — Tanks, projectiles, shields, explosions
**Anchor.** `draw() {`
**What.**
- Tank hull/dome/barrel keep the engine recipe (`BattleScreen.jsx` reproduces it deliberately)
  but the barrel becomes `--brass-300` and the hull keeps the player identity colour.
- `RETRO_COLORS` (grep `const RETRO_COLORS = [`) is replaced by the four design-system player
  colours `#FF2D9B`, `#00BFFF`, `#E0C862`, `#9B5DE0`. **This table is mirrored in
  `lib/constants.js:2` and validated by `room-manager.js:343` `ALLOWED_COLOURS` — both must
  change in the same commit, and the plan adds the missing parity test (R5).**
  The current table has 8 entries and the server allowlists all 8; the design system defines
  4 for 4 seats. Keep 8 entries by extending the four with four muted siblings rather than
  shrinking the table, so `renderLobbySlots`'s colour `<select>` and `COLOUR_TAKEN` logic are
  unaffected.
- Projectile `#ffffff` → `--magenta-500` with a magenta glow (aether, not neutral).
- Explosion rings `#ff3300` / `#ffaa00` / `#ffff00` → `--magenta-600` / `--fire-600` /
  `--fire-400`.
- Shield arc colour comes from `SHIELD_TYPES[type].colour` — retune those six `rgba()` values
  to the cyan/violet family (cyan = shields, per the semantics).
- Guidance crosshair `#ff0000` → `--cyan-500` (guidance is cyan).
- Persistent tracer `rgba(255,255,255,0.4)` → `--cyan-400` at low alpha.
- **Nothing neutral glows.** Brass trim gets at most `--glow-brass`.

**Determinism.** `SHIELD_TYPES[*].colour` is read only by `draw()` — verify with grep before
editing, because `SHIELD_TYPES` is also the source of `strength`/`deflects`, which **are** in
the fence. Change `colour` only.

**Test.** `tests/shields.test.js` (headless) green — proves `colour` is display-only.
`tests/canvas-render.test.js`: `'no canvas fill or stroke uses a colour outside the design
system palette'`.

### 7.3 — Kill feed, damage numbers, HP bars over tanks
**What.** Three things the game does not have (`AUDIT.md` P2-b, and there is currently **no
kill feed, message log, toast or banner anywhere**).
- `AC.KillFeedToast` stack, top-right, max 4, `ac-toast-in` animation. Fed from
  `applyDamageToTank(tank, amount, shooter)` — the single damage entry point — via a new
  `this.pushFeed({ actor, verb, target, weapon, damage })` that **returns immediately when
  `this.headless`**.
- Floating damage numbers rendered in `draw()` from a `this.floatingText[]` array populated by
  the same hook, `--damage` magenta, `ac-readout` metrics.
- Per-tank HP bar above the hull in `draw()`, acid → fire → blood by the `HpBar` thresholds
  (>0.6, >0.3, else).

**Determinism.** **This is the one place in Half A that touches the fence.**
`applyDamageToTank` is inside 584–3394. The hook must:
1. be the last statement, after all state mutation;
2. be wrapped in `if (!this.headless)`;
3. push to a display-only array that no simulation code reads;
4. use `visualRNG` or nothing for any jitter — never `gameplayRNG`.

**Test.** This is the first phase where the replay gate earns its keep:
`assertReplayIdentical` over all three existing action scripts **plus** a new
`'damage feed does not perturb the shared RNG stream'` case that fires eight interleaved
weapons and byte-compares. Also `tests/determinism.test.js:179` source guard (the hook must
not introduce `Math.*`).

---

# HALF B — the content expansion

`components/core/IconTile.jsx` `SPRITES` is the canonical manifest of what the game should
contain: **44 keys** across vehicles (10), ordnance (12), weapons (6), defenses (7),
structures (3) and meta (6). Most do not exist. The rule for every item below: **a chassis
that is only a different sprite is not implemented.**

---

## Phase 8 — Chassis registry (data only)

### 8.1 — The table, one entry, zero behaviour change

**What.** Promote `CHASSIS_GEOMETRY` from Phase 2.1 into the full registry, next to
`const WEAPONS = [`:

```js
const CHASSIS = [
  { id: 'clockwork-tank',    sprite: 'clockwork-tank',    cost: 0,
    hp: 100, halfW: 8, hullH: 6, domeR: 4, barrelLen: 12, centreY: 3,
    move: 'tracked',  driveStep: 4, maxClimb: 10, fuelPerStep: 1, windFactor: 0,
    displayName: 'Clockwork Tank',
    blurb: 'Rides the ground, climbs a modest slope, forgives nothing else.' }
];
const CHASSIS_BY_ID = new Map(CHASSIS.map(c => [c.id, c]));
const DEFAULT_CHASSIS = 'clockwork-tank';
```

Every field of the single entry equals today's hardcoded constant, so the simulation is
byte-identical. `roster` construction in `start(config)` gains
`chassis: p.chassis || DEFAULT_CHASSIS`.

Mirror `CHASSIS_IDS` into `lib/constants.js` alongside `WEAPON_IDS`.

**Determinism (D5).** No new draws. Table lookup only.

**Test.** New `tests/chassis.test.js`:
- `'the client CHASSIS table and the server accept-list name the same chassis'` — a direct
  clone of `weapon-registry.test.js:39`, closing the R5 gap for this table from day one.
- `'clockwork-tank reproduces the legacy geometry constants'`
- Full suite green with zero assertion edits; `assertReplayIdentical` on the three scripts.

---

## Phase 9 — Chassis movement models

**The highest-risk sim work in the plan.** Three commits, one model group each, replay gate
re-run after each.

### 9.1 — `tracked` and `hover` (safe models)

**What.**
- `clockwork-tank` — `tracked`, the existing algorithm, untouched.
- `brass-plated-tank` — `tracked`, `hp: 160`, `halfW: 11`, `driveStep: 3`, `maxClimb: 7`,
  `fuelPerStep: 2`. Trade-off: soaks a Nuke, cannot reposition after one.
- `scout-drone` — `hover`, `hp: 55`, `halfW: 5`, `hullH: 4`, `driveStep: 7`, `maxClimb: 22`,
  `fuelPerStep: 1`. Trade-off: repositions across half the map per round, dies to one direct
  hit; smaller hitbox also means blast falloff hurts it less at the rim.
- `aether-field-tank` — `tracked` with `hp: 90` and a round-start free shield: in
  `grantRoundFuel(tank)` (rename the call site to `grantRoundResources`), if
  `geomFor(tank).fieldShield`, call the existing `raiseBestShield`-style path to seat a
  `{ type: 'Shield', hp: 100 }` at no cash cost.

**Anchor.** `driveTank(tank, dir, steps) {` — replace `CONST.DRIVE_STEP` / `CONST.MAX_CLIMB`
with the chassis values (already parameterised in Phase 2.1); `grantRoundFuel(tank) {`.

**Determinism (D1, D5).** Zero randomness. `driveTank` is a pure function of
`terrain.heights` + integers. Fuel is *spent, not required* inside `driveTank` — the gate
lives in `requestDrive` — and that asymmetry is deliberate (gating inside `driveTank` would
desync remote tanks whose fuel a client cannot see). **Preserve it exactly.** `MOVE_SYNC`
already carries `{ slot, dir, steps }` and `steps` is capped server-side at
`lib/room-manager.js:822`; a `driveStep` of 7 changes distance-per-step, not step count, so
the cap still holds.

**Test.** `tests/movement.test.js` — existing tests green; new:
- `'a scout-drone crosses more ground per fuel unit than a clockwork-tank'`
- `'a brass-plated-tank refuses a slope the clockwork-tank clears'`
- `'an aether-field-tank starts each round with a seated shield'`
- `assertReplayIdentical` with a mixed-chassis roster and a scripted drive sequence.

### 9.2 — `legged` (walker-mech)

**What.** A walker **steps over gaps**. `driveTank` for `move === 'legged'`: instead of
rejecting when `nextHeight - currentHeight > maxClimb`, scan forward up to `strideMax = 3`
columns of `driveStep`; land on the first column whose height is within `maxClimb` of the
*current* height; if none, the step fails as today. Descending is unrestricted. Costs
`fuelPerStep: 2`.

Stats: `hp: 110`, `halfW: 7`, `hullH: 10`, `centreY: 6` (taller silhouette — easier to hit
over a ridge), `driveStep: 4`, `maxClimb: 26`, `strideMax: 3`.

**Anchor.** `driveTank(tank, dir, steps) {` — a new branch, not a rewrite of the tracked path.

**Determinism (D1, D5, D6).** Pure integer/`Float32Array` arithmetic, no RNG, no trig. The
forward scan reads `terrain.heightAt(x)` which is a clamped linear interpolation — already
deterministic and already used by the tracked path. **Failure mode to guard: the scan must
terminate on a fixed bound (`strideMax`), never on a `while (blocked)` loop**, or two clients
with a one-column terrain difference would take different numbers of steps. Terrain is
byte-identical by construction, but a bounded loop makes the guarantee structural.

**Test.** `tests/movement.test.js`:
- `'a walker-mech steps over a one-column chasm a tracked chassis stops at'`
- `'a walker-mech stops at a gap wider than its stride'`
- `'walker traversal is identical for identical terrain and inputs'` (replay gate, drive-only
  script, 200 steps)

### 9.3 — `airborne` (airship-platform)

**What.** Ignores terrain entirely; holds a fixed `altitude` above the *world floor*, not
above the ground, so it can sit over a chasm. It is **pushed by wind**.

Stats: `hp: 80`, `halfW: 13`, `hullH: 7`, `move: 'airborne'`, `altitude: 210`,
`driveStep: 5`, `fuelPerStep: 1`, `windFactor: 0.9`, `maxClimb: Infinity`.

- `snapTanksToTerrain()` must skip airborne chassis (`tank.y = CONST.WORLD_H - altitude`).
- `reSeatTanks()` must skip them — they never fall, so they take no drop damage and never
  consume a Parachute.
- **Wind drift.**

**Determinism (D4) — the load-bearing decision of this phase.**

The obvious implementation — drift the airship by `wind * dt` every tick inside `stepPhysics`
— **desyncs instantly**. `loop()` drives `update()` from `requestAnimationFrame` with a
real-time accumulator, so a client that has had the tab open for 90 seconds has executed
thousands more ticks than one that just rejoined. Between shots the tick count is unbounded
and unsynchronised. Today this is harmless because nothing moves between shots.

**Therefore airship drift is turn-scoped, not tick-scoped:**

```js
// Applied exactly once per airborne tank per turn, in roster order,
// at the moment the turn cursor advances. Pure function of two replicated values.
driftAirborne(turnNumber) {
  for (const tank of this.roster) {                       // D5: roster order
    const g = geomFor(tank);
    if (g.move !== 'airborne' || tank.hp <= 0) continue;
    const dx = Math.round(this.wind * g.windFactor * CHASSIS_DRIFT_K);   // integer columns
    tank.x = Math.max(CONST.TANK_MARGIN,
             Math.min(CONST.WORLD_W - CONST.TANK_MARGIN, tank.x + dx));
    tank.y = CONST.WORLD_H - g.altitude;
  }
}
```

Called from **`applyTurnSync(msg)`** (online — after `setActiveSlot`, keyed to
`msg.turnNumber`) and from **`nextTurn()`** (local). `this.wind` is server-authoritative and
re-broadcast on every `FIRE_SYNC`; `turnNumber` is server-authoritative. `Math.round` to whole
columns removes float accumulation entirely. Zero RNG.

**Test.**
- `tests/chassis.test.js`: `'an airship drifts a whole number of columns per turn'`,
  `'airship drift is bounded by the world margin'`, `'an airship takes no drop damage and
  consumes no parachute'`, `'drift is zero when wind is zero'`.
- `tests/browser-lockstep.test.js` — **new case**: `'two clients agree on airship position
  after five turn handoffs'`. This is the only test that proves D4 in the real two-client
  path; do not substitute a headless test for it.
- `assertReplayIdentical` with an airborne roster.

**Assumption.** `CHASSIS_DRIFT_K` is tuned so max wind (±150) moves an airship ~15 columns per
turn — noticeable, survivable, and always an integer. Tune by feel; the determinism argument
does not depend on the value.

---

## Phase 10 — Chassis selection over the wire

### 10.1 — Protocol

**What.** `SET_PROFILE` gains `chassis`; `ROOM_STATE.players[]` and `ROUND_START.tanks[]`
carry it.

**Anchor.**
- `lib/protocol.js:60–63` (`SET_PROFILE` schema) — add `chassis: v => v === undefined ||
  (typeof v === 'string' && v.length <= 32)`
- `lib/protocol.js:92–106` (`ROOM_STATE`) — add to the per-player validator
- `lib/protocol.js:178–185` **`optionalFields`** — add `'SET_PROFILE.chassis'`,
  `'ROOM_STATE.players.chassis'`. **This is mandatory**: `validate()` errors on a missing
  non-optional field, so a client that has not been updated would be disconnected.
- `lib/room-manager.js:311 setProfile()` — validate against a `ALLOWED_CHASSIS` Set built from
  `CHASSIS_IDS`, mirroring the `ALLOWED_COLOURS` check at :343.

**Downgrade, do not reject.** Follow the weapon precedent at `lib/room-manager.js:659–662`
exactly: an unknown chassis silently becomes `'clockwork-tank'`. The rationale in the comment
at :9–18 applies verbatim — a rejection can wedge a turn, and the client and server disagreeing
about *which* chassis is worse than either choice.

**Determinism.** The wire value is the input; every client derives geometry from the same
string. A client that has never heard of `walker-mech` renders and simulates a
`clockwork-tank` and **desyncs**. Guard: `ROUND_START` is the authority, and the chassis
parity test (8.1) means client and server tables cannot drift within a deploy.

**Test.** `tests/protocol.test.js`: `'SET_PROFILE accepts a chassis'`, `'SET_PROFILE without a
chassis still validates'`. `tests/chassis.test.js`: `'the server downgrades an unknown chassis
to clockwork-tank'`, `'two players may pick the same chassis'` (unlike colour, chassis is not
exclusive).

### 10.2 — Lobby UI + solo picker
**Anchor.** `function renderLobbySlots(roomState) {` and `function renderSoloAiList()`.
**What.** `AC.LobbySlot` already accepts `chassis` and `chassisSprite`. Add an `AC.Select` per
own-slot row wired to `net.send('SET_PROFILE', { name, colour, chassis })`. Solo rows get the
same select; AI seats get a chassis assigned by profile (Poolshark → `brass-plated-tank`,
Cyborg → `airship-platform`, Shooter → `walker-mech`, Moron → `scout-drone`) — a fixed map,
not a random draw.
**Test.** `browser-lockstep.test.js`: `'a chassis chosen in the lobby reaches both clients'`.

---

## Phase 11 — Structures: something to defend

This is an entirely new mechanic. Three commits.

### 11.1 — The structure model and its own RNG stream

**What.**
```js
const STRUCTURES = [
  { id: 'norman-castle',  sprite: 'norman-castle',  hp: 400, w: 90, h: 70, kind: 'keep',
    cost: 0, displayName: 'Norman Keep',
    blurb: 'Your seat. Lose it and the round is lost, whatever your hull says.' },
  { id: 'keep-gatehouse', sprite: 'keep-gatehouse',  hp: 200, w: 44, h: 52, kind: 'wall',
    cost: 1500, displayName: 'Keep Gatehouse',
    blurb: 'Absorbs a shell aimed at the keep; rubble fills the breach.' },
  { id: 'aether-forge',   sprite: 'aether-forge',    hp: 150, w: 50, h: 40, kind: 'economy',
    cost: 2500, displayName: 'Aether-Forge',
    blurb: 'Crafts between rounds; destroyed, it takes the recipe queue with it.' }
];
```
`Game` gains `this.structures = []`, each
`{ sid, id, ownerSlot, x, y, hp, maxHp, destroyed }`.

Placement at `newRound(roundSeed) {`, **after** the existing `gameplayRNG.seed(roundSeed)` and
wind draw, from a **new dedicated stream**:

```js
const structureRNG = createRngStream(1);          // declared beside terrainRNG/gameplayRNG
// inside newRound, after wind:
structureRNG.seed((roundSeed ^ 0x5EED5701) >>> 0);
```

Each living player gets a keep placed behind their tank's spawn column, offset by
`structureRNG.int(-40, 40)`, clamped to margins, `y` snapped to terrain.

**Determinism (D2 — the central rule of this phase).** `gameplayRNG` is positional. If keep
placement drew from it, adding or removing a structure would shift wind and every tank spawn
for the rest of the round. The dedicated stream makes structure count and structure changes
**invisible** to every other system. This mirrors the `terrainRNG` / `gameplayRNG` split that
`tests/determinism.test.js:38` already proves.

**Ordering.** Structures are placed **after** tanks in `newRound` and in
`applyServerRoundStart` (which re-draws every `tank.x` from `gameplayRNG` in roster order —
grep `applyServerRoundStart`). Structure placement must be appended to *both* code paths in
the same commit, in roster order, or online round 2+ diverges from local.

**Test.** `tests/structures.test.js`:
- `'structure placement is byte-identical no matter how many gameplay draws precede it'` — a
  direct clone of `determinism.test.js:38`, the single most important test in this phase
- `'structure placement is identical between newRound and applyServerRoundStart'`
- `'each living player receives exactly one keep'`
- `replay.js` `digest` extended to include
  `structures.map(s => \`${s.sid}:${s.x}:${s.y}:${s.hp}\`)` — **update the helper in this
  commit or every later replay assertion is blind to structures.**

### 11.2 — Structure damage and destruction

**What.** `applyDamageToStructure(structure, amount, shooter)` sibling of
`applyDamageToTank`. `explosion(x, y, radius, damage, shooterIdx, opts)` iterates
**tanks first (roster order), then structures (array index order)** with the same linear
falloff `damage * (1 - dist/radius)`, measured to the structure's centre with a
rectangular-overlap test rather than a point test (structures are 44–90 px wide; a point test
would make a keep dodgeable).

On destruction: `destroyed = true`, and `terrain.deposit(x, y, w/2)` drops rubble, then
`terrain.settle()` — reusing the existing dirt-delivery primitives rather than inventing
terrain code.

**Round-end condition.** Add: a player whose `kind: 'keep'` is destroyed is eliminated even at
full HP. This changes the win condition, so it must be gated behind a room config flag
`siegeMode` (default **off**) until Phase 12 lands, so it cannot regress
`tests/match-rounds.test.js` or `turn-authority.test.js`.

**Determinism (D1, D5).** Zero RNG. Iteration order fixed. Rubble goes through the existing
deterministic `deposit`/`settle`. The chain-reaction path in `explosion` (a killed tank
re-enters `explosion(tank.x, tank.y-3, 35, 50, shooterIdx)`) must **not** be extended to
structures in this commit — a keep collapse triggering a secondary explosion that destroys a
neighbouring keep is a recursion whose depth depends on placement, and placement is per-round
random. Add it later, with an explicit depth cap, or not at all.

**Test.** `tests/structures.test.js`:
- `'a direct hit reduces keep hp by the full blast damage'`
- `'blast falloff is measured against the structure rectangle, not its centre point'`
- `'a destroyed keep deposits rubble and settles the terrain'`
- `'siegeMode off preserves the last-tank-standing win condition'`
- `assertReplayIdentical` with a shot that destroys a keep — **the terrain-heights byte
  comparison is the real proof here**, because rubble deposition is the first new system that
  writes terrain.

### 11.3 — Passive defenses and structures in the shop

**What.** `oil-vats` (damages any tank that drives within 30 px, once per turn),
`portcullis` (blocks driving through the owner's keep column band),
`shield-dome` (a structure-scoped shield that absorbs before keep HP),
`repair-bay` (heals the owner's keep by a fixed 25 at turn start),
`aether-radar` (reveals opponent aim readouts in the HUD — display only, zero sim effect).
All purchasable from the Aether Forge as a new `AC.ShopRow` column.

**Determinism.** All effects are fixed-magnitude and resolved at a single point:
`resolveStructurePhase(turnNumber)` called from `applyTurnSync` / `nextTurn`, iterating
structures in index order. No RNG at all in this commit. `aether-radar` is display-only and
must be behind `if (!this.headless)`.

**Test.** `tests/structures.test.js` one case per defense, plus
`assertReplayIdentical` with all five active.

---

## Phase 12 — Active defenses

**Highest desync risk in the plan.** `scorpion-crossbow` and `missile-silo` **fire**, which
means injecting damage outside the `FIRE`→`FIRE_SYNC`→`RESOLVE_SHOT` lockstep.

### 12.1 — Hitscan-only auto-fire

**What.** `scorpion-crossbow` (short range, 30 damage) and `missile-silo` (long range, 60
damage, one shot every third turn).

**Determinism (D1, D3, D4, D5, D6) — the design that makes this safe:**

1. **No flying projectile.** An auto-fired projectile would have to be spawned identically on
   every client with an identical velocity vector, which is exactly the problem `FIRE_SYNC`
   exists to solve — and the server does not simulate, so it cannot mint the vector.
   **Auto-defenses are hitscan.** Damage is applied instantly, at turn resolution.
2. **No randomness.** Target selection is `the living enemy tank with the lowest slot number
   within range`, not the nearest, not a random pick. Deterministic tie-break by construction.
3. **No real time.** Resolved inside `resolveStructurePhase(turnNumber)`, once per turn, in
   structure index order.
4. **Cadence derived from `turnNumber`**, not a local counter: `missile-silo` fires when
   `turnNumber % 3 === 0`. A rejoining client recomputes the same schedule.
5. **Range test uses `Math.sqrt`** (exempt) or squared distance (preferred — no sqrt at all).

**Anchor.** New `resolveStructurePhase(turnNumber)` on `Game`, called from
`applyTurnSync(msg)` and `nextTurn()`. Damage routed through `applyDamageToTank` so the
kill-feed and shield logic are reused unchanged.

**Test.**
- `tests/structures.test.js`: `'a scorpion-crossbow strikes the lowest-slot enemy in range'`,
  `'a missile-silo fires on every third turn number'`, `'auto-defense damage passes through
  the shield path'`, `'auto-defense fires zero projectiles'`.
- **`tests/browser-lockstep.test.js` — mandatory new case**: `'two clients agree on hp after an
  auto-defense resolves across three turn handoffs'`. A headless test cannot prove D4.
- `assertReplayIdentical` ×2 (with and without auto-defenses).

### 12.2 — `siegeMode` on by default; win condition change
**What.** Flip the Phase 11.2 flag on for new rooms, add it to the host settings panel as an
`AC.Switch` (brass ratchet), thread through `START_GAME.config`.
**Test.** `tests/match-rounds.test.js` gains `'a player with a destroyed keep is eliminated at
full hull'`; every existing round test explicitly sets `siegeMode: false` so the legacy win
condition stays covered.

### 12.3 — AI awareness
**Anchor.** `checkAIShot() {`
**What.** Cyborg and Poolshark gain a keep-targeting branch (target the enemy keep when it has
less HP remaining than the enemy tank). **The RNG jitter draws must not change count** —
Moron takes 2 draws, Shooter 2, Poolshark 2, Cyborg 0. Adding a branch that skips a jitter
draw for some targets violates D3 and desyncs every later shot.
**Test.** `tests/solo-ai.test.js`: `'each AI profile consumes a fixed number of RNG draws
regardless of target choice'` — assert `gameplayRNG` state advances by the same amount.

---

## Phase 13 — Ordnance: beams and hitscan

Easiest new weapons; land them first to establish the pattern.

**What.** Three entries in `WEAPONS`, three matching ids in `lib/constants.js:WEAPON_IDS`:

| id | displayName | kind | cost | packSize | blast | damage | behaviour |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `Lightning Lance` | Lightning Lance | `beam` | 3500 | 3 | 18 | 95 | straight ray from the barrel, stops at first terrain column or hull; no gravity, no wind |
| `Tesla Coil Cannon` | Tesla Coil Cannon | `beam` | 4500 | 2 | 26 | 70 | as above, then **arcs** to the next tank within 120 px for half damage, max 2 arcs |
| `Sonic Disruptor` | Sonic Disruptor | `beam` | 3000 | 3 | 40 | 45 | cone; damages *and* applies the Phase 15 `deafened` effect |

**Anchor.** `const WEAPONS = [`, `lib/constants.js:30 WEAPON_IDS`,
`onImpact(x, y, weapon, shooterIdx, proj) {` (new `kind` branches),
`stepPhysics(dt) {` (the existing `'Laser'` special case already skips gravity/wind — grep
`'Laser'` and generalise it to `kind === 'beam'`).

**Determinism (D1, D3, D6).** **Zero RNG draws** for all three. Arc chaining iterates the
roster in slot order and takes the first match, with a hard cap of 2 — never a `while`.
Ray marching uses fixed integer column steps against `terrain.heightAt`, no trig beyond
`detCos`/`detSin` for the direction vector.

**Test.** `tests/weapon-families.test.js`:
- `'a beam weapon ignores gravity and wind'`
- `'a tesla arc chains to at most two additional hulls'`
- `'beam weapons consume zero gameplay RNG draws'` — snapshot the stream before and after
- `assertReplayIdentical` with all three interleaved
- `tests/weapon-registry.test.js` passes unchanged (it enumerates ids from both sides, so the
  three additions must land in `lib/constants.js` in the same commit or CI goes red — which is
  exactly the intended behaviour).

---

## Phase 14 — Ordnance: sub-munition and terrain

| id | displayName | kind | cost | pack | blast | dmg | behaviour |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `Steam Mortar` | Steam Mortar | `explosive` | 300 | 6 | 34 | 55 | high-arc, short range; the guild's cheap staple |
| `Aether Strike Missile` | Aether-Strike Missile | `multi` | 5500 | 1 | 100 | 200 | splits into **exactly 3** at apex, wide spread |
| `Phosphorus Cannon` | Phosphorus Cannon | `pattern` | 3200 | 2 | 22 | 35 | **exactly 6** bomblets in a fixed fan, each leaves a burning patch |
| `Void Rift Projector` | Void-Rift Projector | `disrupter` | 6500 | 1 | 70 | 120 | terrain falls **inward**: `carve` then `deposit` at the rim |
| `Acid Sprayer` | Acid Sprayer | `liquid` | 2800 | 3 | 16 | 8 | liquid stream, applies `corroded` (Phase 15) |

**Anchor.** `const WEAPONS = [`, `lib/constants.js:30`,
`onImpact(x, y, weapon, shooterIdx, proj) {` (new branches),
the MIRV apex-split block inside `stepPhysics` (grep `numSub`) for the sub-munition pattern.

**Determinism (D3) — the rule this phase exists to test.** Sub-munition counts are **compile-
time constants**, never `rng.int(a, b)`. Each split consumes a **fixed** number of
`gameplayRNG` draws: the existing MIRV path draws sub-munition speeds from `gameplayRNG`, so
`Aether Strike Missile` draws exactly 3 and `Phosphorus Cannon` exactly 6, unconditionally,
before any terrain or hit check. Never `if (nearGround) skip`.

`Void Rift Projector` calls `carve` then `deposit` then `settle` — all three already
deterministic. `settle()` runs a bounded 20 passes (`lib/... class Terrain settle()`), so
convergence cannot vary by client.

**Test.** `tests/weapon-families.test.js`:
- `'an Aether-Strike Missile always yields exactly three sub-munitions'`
- `'a Phosphorus Cannon consumes six RNG draws whether or not it hits terrain'` — fire it into
  open sky and into a hillside, assert equal stream advance. **This is the test that catches
  the classic silent desync.**
- `'a Void-Rift Projector conserves less dirt than it displaces'` (uses
  `headless-game.js:terrainVolume`)
- `assertReplayIdentical` ×2: one all-new-weapon script, one interleaving new and legacy
  weapons — the second is what proves stream alignment across the boundary
  (`game-determinism.test.js:123` is the model).

---

## Phase 15 — Ordnance: status effects

**What.** A per-tank `effects` map with fixed durations in **turns**, never seconds:

| effect | source | mechanic | duration |
| --- | --- | --- | --- |
| `corroded` | `Acid Sprayer` | 12 damage at the start of each of the victim's turns | 3 turns |
| `netted` | `Net Gun` | `requestDrive` and `requestTeleport` refused | 2 turns |
| `deafened` | `Sonic Disruptor` | ±6° forced aim error, applied at fire time | 2 turns |
| `tethered` | `Clockwork Harpoon` | victim dragged 20 columns toward the shooter on hit | instant |
| `rammed` | `Pike Ram` | shooter closes to contact; both take 30 | instant |

New weapons: `Net Gun` (`kind: 'utility'`, 1200, ×4), `Clockwork Harpoon`
(`kind: 'pattern'`, 1800, ×4 — reuse the roller downhill behaviour then tether),
`Pike Ram` (`kind: 'utility'`, 900, ×3).

**Anchor.** `applyDamageToTank(tank, amount, shooter) {` (effect application),
a new `tickEffects(slot)` called from `applyTurnSync` / `nextTurn` (D4 — turn-scoped),
`requestDrive(dir) {` / `requestTeleport() {` (the `netted` gate),
`fireActiveWeapon() {` and `applyFireSync(msg) {` (the `deafened` aim error).

**Determinism (D1, D3, D4) — three specific traps:**

1. **`deafened` aim error must not be random.** A `rng.range(-6, 6)` at fire time would draw
   from `gameplayRNG` on every client — which *is* synchronised — but the shot vector comes
   from the **server**, computed at `lib/room-manager.js:668–675` from the raw `angle`, and the
   server knows nothing about effects. The client would then simulate a different trajectory
   than the vector it was handed. **Solution: `deafened` perturbs the angle in
   `fireActiveWeapon` *before* the `FIRE` message is sent, deterministically from
   `(turnNumber * 2654435761) >>> 0` mod 13 − 6.** The server receives and echoes the already-
   perturbed angle; every client integrates the server's vector. Zero RNG, zero divergence.
2. **Effect durations tick on turn boundaries**, decremented in `tickEffects` keyed to
   `TURN_SYNC.turnNumber`, never on `stepPhysics` ticks (D4).
3. **`tethered` and `rammed` move a tank outside `MOVE_SYNC`.** That is acceptable *only*
   because the displacement is a pure function of the impact position and the shooter position,
   both of which every client already has identically from `FIRE_SYNC` + shared simulation.
   Compute it inside `onImpact`, never in `requestDrive`. Clamp to `TANK_MARGIN` exactly as
   `teleportTank` does.

**Test.** `tests/triggers.test.js` (the existing home for per-shot modifiers) plus new
`tests/effects.test.js`:
- `'corroded deals damage at the start of the victim turn, not on physics ticks'`
- `'a netted tank cannot drive or teleport, and the effect expires after two turns'`
- `'deafened aim error is a pure function of turn number'` — same turn ⇒ same offset, twice
- `'a tether displacement is identical on both clients'` (**`browser-lockstep.test.js`**)
- `replay.js` `digest` extended a second time to include the `effects` map — **without this,
  every effect in this phase is unproven by the replay gate.**
- `assertReplayIdentical` ×2.

---

## Phase 16 — Aether-Forge crafting and meta

**What.** Four materials (`fusion-bottle`, `aetherium-shard`, `clockwork-gears`,
`powdered-sapphire`), a fixed recipe table, `siege-loot` awards, `guild-expedition`.

```js
const MATERIALS = ['fusion-bottle', 'aetherium-shard', 'clockwork-gears', 'powdered-sapphire'];
const RECIPES = [
  { out: 'Aether Strike Missile', qty: 1, in: { 'aetherium-shard': 2, 'clockwork-gears': 1 } },
  { out: 'Tesla Coil Cannon',     qty: 2, in: { 'fusion-bottle': 1, 'powdered-sapphire': 2 } },
  { out: 'Void Rift Projector',   qty: 1, in: { 'aetherium-shard': 3, 'powdered-sapphire': 1 } },
  { out: 'shield-dome',           qty: 1, in: { 'clockwork-gears': 2, 'fusion-bottle': 1 } }
];
```

- **`siege-loot`** — awarded at `handleRoundEnd()` from a **derived, not random** rule:
  1 material per 150 damage dealt, plus 1 per kill, plus 1 for surviving. Material *type* is
  chosen by `(slot + currentRound) % MATERIALS.length` — a pure function, no RNG at all.
- **`guild-expedition`** — a between-round choice (`AC.Modal`, three fixed options: cash,
  materials, or a discounted chassis swap). Player input, replicated exactly like `SHOP_DONE`.
- **`aether-forge`** structure gates crafting: if the owner's forge is destroyed, the craft
  button is disabled for that round.

**Determinism (D1, D2).** Crafting is entirely economic and lives **outside** the simulation
fence (`buy`/`sell`/`handleRoundEnd` are all after `// === END SIMULATION PATH ===` except
`handleRoundEnd`, which is after 3394 — verify). Loot is derived, not drawn, so no new stream
is needed. **If a future variant wants random loot, it uses `lootRNG` seeded
`(roundSeed ^ 0x5EED10A7)`, never `gameplayRNG`** (D2).

**Test.** `tests/shop.test.js` and a new `tests/crafting.test.js`:
- `'loot award is a pure function of damage, kills and survival'`
- `'crafting consumes exactly the recipe inputs and produces the stated output'`
- `'crafting with insufficient materials is refused and mutates nothing'`
- `'a destroyed aether-forge disables crafting for its owner'`
- `'crafting draws zero values from any simulation RNG stream'` — snapshot all three stream
  states across a full craft cycle.

---

## Appendix A — What can regress the existing 205 tests, by phase

| Phase | Regression vector | Mitigation |
| --- | --- | --- |
| 0.2 | `classList.contains` going from constant `false` to real | run the suite; a red test was relying on the bug |
| 2.1 | tank AABB / damage reference point | defaults byte-identical; **zero assertion edits allowed** |
| 3 | none expected (no harness parses CSS) | `tests/page-structure.test.js` |
| 5.2 | `NET_ERROR_TEXT` copy vs `browser-lockstep.test.js:169,182` regexes | update regexes in the same commit |
| 6.1–6.5 | element ids, `.click()` targets, `multiplayer-slots.children.length` | id inventory in Phase 6 header; `AC.LobbySlot` appended as a direct child |
| 6.2 | `smoke.test.js:119–141` `.player-row` innerHTML child synthesis | keep the synthesis; verify, do not delete |
| 7.2 | `RETRO_COLORS` ↔ `lib/constants.js:2` ↔ `room-manager.js:343 ALLOWED_COLOURS` | change all three in one commit; add the missing parity test |
| 7.3 | a hook inside `applyDamageToTank` (in the fence) | `!this.headless`, last statement, display-only array, replay gate |
| 9.3 | airship drift keyed to real time | turn-scoped drift; `browser-lockstep` two-client test |
| 10.1 | `protocol.js` non-optional field disconnects old clients | `optionalFields` entry is mandatory |
| 11.1 | new `gameplayRNG` draws shifting wind and spawns | dedicated `structureRNG`; clone of `determinism.test.js:38` |
| 11.2 | keep-loss win condition | `siegeMode` default off until 12.2 |
| 12.1 | auto-fired projectiles outside `FIRE_SYNC` | hitscan only, no projectile, no RNG |
| 12.3 | AI branch changing RNG draw count | fixed-draw-count assertion per profile |
| 13–15 | new weapon ids missing from `lib/constants.js` | `weapon-registry.test.js` catches it — by design |
| 14 | conditional sub-munition draws | fire-into-sky vs fire-into-hill stream-advance equality test |
| 15 | `deafened` perturbing angle after the server minted the vector | perturb before `FIRE` is sent |
| all | a second `<script>` tag or a literal `</script>` in a string | `tests/page-structure.test.js` from Phase 0.1 |

## Appendix B — Sprite manifest → mechanic map

`SPRITES` has **44** keys (`readme.md:76` says 37; the executable value wins).

| Group | Key | Phase | Status after this plan |
| --- | --- | --- | --- |
| vehicles | `clockwork-tank` | 8 | shipped (baseline chassis) |
| | `brass-plated-tank`, `scout-drone`, `aether-field-tank` | 9.1 | shipped |
| | `walker-mech` | 9.2 | shipped |
| | `airship-platform` | 9.3 | shipped |
| | `drone-bay`, `submersible`, `hover-skiff`, `siege-platform` | — | **out of scope**: not named in the brief; `submersible` has no water, `hover-skiff` duplicates `scout-drone` |
| ordnance | `steam-mortar`, `aether-strike-missile`, `phosphorus-shell` | 14 | shipped |
| | `lightning-lance`, `sonic-disruptor` | 13 | shipped |
| | `clockwork-harpoon` | 15 | shipped |
| | `void-bomb`, `acid-rounds`, `void-balls`, `tesla-cores`, `aether-nuke`, `dirt-clod` | 5.2 | **display renames of existing weapons** (Death's Head, Napalm, Meganuke, Dirt Clod…) |
| weapons | `tesla-coil-cannon` | 13 | shipped |
| | `acid-sprayer`, `void-rift-projector` | 14 | shipped |
| | `net-gun`, `pike-ram` | 15 | shipped |
| | `phosphorus-cannon` | 14 | shipped |
| defenses | `shield-dome`, `aether-radar`, `repair-bay`, `oil-vats`, `portcullis` | 11.3 | shipped |
| | `scorpion-crossbow`, `missile-silo` | 12.1 | shipped |
| structures | `norman-castle`, `keep-gatehouse`, `aether-forge` | 11.1 | shipped |
| meta | `fusion-bottle`, `aetherium-shard`, `clockwork-gears`, `powdered-sapphire`, `siege-loot`, `guild-expedition` | 16 | shipped |

All 44 keys have an `AC.IconTile` slot from Phase 4.2; the four out-of-scope vehicles render
the sanctioned initials placeholder until art and mechanics exist.

## Appendix C — Assumptions this plan makes

1. **No React, no bundler, no npm install step.** Tokens are copied as CSS text; components
   are re-expressed as vanilla factories with identical prop names. If a build step ever
   becomes acceptable, Phases 3–4 are the ones to revisit.
2. **oxlint is not installed.** The three portable rules are reimplemented in
   `tools/design-lint.js`. Recorded with rule-index provenance.
3. **Weapon, item, shield and chassis `id`s are protocol; `displayName` is copy.** Never
   rename an id for cosmetic reasons.
4. **Airship drift is turn-scoped.** Tick-scoped drift is unimplementable in this architecture
   without a server-side simulator. This is the single largest design constraint imposed by
   determinism and it is stated in the code comment beside `driftAirborne`.
5. **Auto-defenses are hitscan.** For the same reason: the server mints shot vectors and does
   not simulate, so a structure cannot fire a projectile.
6. **`Math.sqrt` remains exempt** from the trig ban (IEEE-754 correctly rounded); prefer
   squared distances anyway.
7. **The 44-key manifest is authoritative** over the "37" in `readme.md:76` and in the brief.
8. **The five in-flight config selects (gravity, wind variability, terrain style, hill count,
   flatness) are landed or reverted before Phase 0.** This plan assumes they exist and
   preserves their ids.
9. **CI budget.** Each phase adds at most two `assertReplayIdentical` cases (~300 ms each).
   If `npm test` passes 4 minutes, split the replay tests into a second CI job rather than
   raising `timeout-minutes: 5`.
