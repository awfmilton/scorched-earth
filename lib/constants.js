/**
 * Game mode — the single most important field in the match configuration.
 *
 * 'aethercastle' is the game this repo is becoming; 'classic' is the original
 * DOS-era Scorched Earth replica, kept playable as an easter egg for fans.
 * They are NOT cosmetic variants of each other: classic has one chassis and no
 * castles, aethercastle has six chassis and structures on the field. Two
 * clients running different modes would simulate different worlds.
 *
 * So mode is decided ONCE, by the server, when the room is created, and is
 * restated in ROUND_START next to the seed. It is never a per-client toggle
 * and never changes mid-match. tests/mode-contract.test.js holds that line.
 */
const GAME_MODES = ['aethercastle', 'classic'];
const DEFAULT_MODE = 'aethercastle';

function isGameMode(value) {
  return typeof value === 'string' && GAME_MODES.includes(value);
}

function normaliseMode(value) {
  return isGameMode(value) ? value : DEFAULT_MODE;
}

// Aethercastle player identity palette. Slot ORDER is a wire contract shared
// with the client — index N here is the default colour of room slot N — so
// values were rethemed in place and the ordinals never moved.
// Hues stay separated at low saturation so two houses never read alike.
const AETHERCASTLE_COLORS = [
  { value: '#ff2d9b', name: 'Aether Magenta' },
  { value: '#00bfff', name: 'Clockwork Cyan' },
  { value: '#e23a2e', name: 'Blood Iron' },
  { value: '#8fd400', name: 'Acid Green' },
  { value: '#e0c862', name: 'Guild Brass' },
  { value: '#9b5de0', name: 'Void Violet' },
  { value: '#ffa31a', name: 'Phosphor Fire' },
  { value: '#f6e9c6', name: 'Parchment' }
];

// The original CGA/EGA-inspired palette, restored verbatim for classic mode.
// Same length and same slot meanings as the Aethercastle table above, so slot
// N keeps its identity whichever mode the room is in.
const CLASSIC_COLORS = [
  { value: '#ff00ff', name: 'Magenta' },
  { value: '#00ffff', name: 'Cyan' },
  { value: '#ff2222', name: 'Red' },
  { value: '#22ff22', name: 'Green' },
  { value: '#ffff00', name: 'Yellow' },
  { value: '#2222ff', name: 'Blue' },
  { value: '#ff8800', name: 'Orange' },
  { value: '#ffffff', name: 'White' }
];

const PALETTES = {
  aethercastle: AETHERCASTLE_COLORS,
  classic: CLASSIC_COLORS
};

function paletteFor(mode) {
  return PALETTES[normaliseMode(mode)];
}

// Back-compatible default export. Existing call sites that predate modes read
// this and get the Aethercastle table, which is the default mode.
const RETRO_COLORS = AETHERCASTLE_COLORS;

// Maximum number of players in a room; slots are integers in [0, MAX_PLAYERS)
const MAX_PLAYERS = 4;

// World width in pixels. Mirrors CONST.WORLD_W in index.html; the server needs
// it to mint a teleport destination that lands inside the map every client
// generated. If one of the two ever changes, both must.
const WORLD_W = 1200;

// Tanks never spawn or teleport flush against the edge.
const WORLD_MARGIN = 40;

// Every weapon the game knows about. The server validates FIRE against this
// list and falls back to Baby Missile for anything else, so a weapon missing
// here is silently downgraded for every online player — which is exactly what
// had happened to Digger and Heavy Digger. index.html owns the full config
// (cost, blast, damage); this is the id list both sides agree on, and
// tests/weapon-registry.test.js fails if the two ever drift apart.
const WEAPON_IDS = [
  'Baby Missile', 'Missile', 'Baby Nuke', 'Nuke', 'Meganuke',
  'MIRV', "Death's Head", 'Cluster Bomb', 'Funky Bomb',
  'Baby Roller', 'Roller', 'Heavy Roller',
  'Digger', 'Heavy Digger',
  'Baby Sandhog', 'Sandhog', 'Heavy Sandhog',
  'Riot Charge', 'Riot Blast', 'Riot Bomb', 'Heavy Riot Bomb',
  'LeapFrog',
  'Napalm', 'Hot Napalm', 'Liquid Dirt',
  'Dirt Clod', 'Dirt Ball', 'Dirt Bomb', 'Ton of Dirt', 'Dirt Detonator',
  'Earth Disrupter', 'Plasma Blast', 'Laser',
  'Sandstorm', 'Tracer', 'Smoke Tracer'
];

// The subset a room set to "Basic" is allowed to fire. This is a RULE, not a
// UI suggestion: the client hides the advanced tiers in a Basic room, but a
// modified client can send whatever it likes, and every other client will
// faithfully simulate whatever comes back in FIRE_SYNC — so the server has to
// hold the line too. 'Baby Missile' must stay in this list, because it is also
// the fallback an out-of-tier FIRE is downgraded to.
const BASIC_WEAPON_IDS = ['Baby Missile', 'Missile', 'Tracer'];

/**
 * Vehicle chassis registry — the shared half.
 *
 * A chassis changes how a tank MOVES and how much punishment it takes, so
 * every client has to agree on which one a player is driving before the first
 * MOVE_SYNC lands. That makes it a wire contract, not a cosmetic: the id
 * travels in SET_PROFILE, is echoed in ROOM_STATE, and is restated in
 * ROUND_START.tanks so a late joiner rebuilds the same roster.
 *
 * index.html mirrors this table (the client also needs draw data); the shapes
 * are checked against each other by tests/chassis-registry.test.js, which
 * fails if the two ever drift apart.
 *
 * locomotion drives the movement branch in Game.driveTank():
 *   tracked — follows the surface, refuses a rise steeper than maxClimb
 *   legged  — plants a foot at full stride and ignores what is between
 *   aerial  — ignores terrain entirely, and is pushed downwind every turn
 *   hover   — follows the surface at a clearance, cheap to climb, fragile
 *
 * armour is a DAMAGE MULTIPLIER: below 1 is tougher, above 1 is squishier.
 */
const CHASSIS = {
  'clockwork-tank': {
    id: 'clockwork-tank', name: 'Clockwork Tank', locomotion: 'tracked',
    hp: 100, armour: 1.00, driveStep: 4, maxClimb: 10, fuel: 100, fuelPerStep: 1
  },
  'walker-mech': {
    id: 'walker-mech', name: 'Walker Mech', locomotion: 'legged',
    hp: 120, armour: 0.85, driveStep: 7, maxClimb: 34, fuel: 70, fuelPerStep: 2,
    // A stride clears whatever sits between the two footfalls, which is what
    // lets a mech cross a crater a tracked hull has to drive around.
    strideClearance: true
  },
  'airship-platform': {
    id: 'airship-platform', name: 'Airship Platform', locomotion: 'aerial',
    hp: 80, armour: 1.15, driveStep: 5, maxClimb: Infinity, fuel: 110, fuelPerStep: 1,
    // Holds station this far above the tallest ground beneath it, and slides
    // this fraction of the wind every turn it is airborne.
    cruiseAltitude: 140, windDrift: 0.05
  },
  'brass-plated-tank': {
    id: 'brass-plated-tank', name: 'Brass-Plated Tank', locomotion: 'tracked',
    hp: 140, armour: 0.65, driveStep: 3, maxClimb: 6, fuel: 80, fuelPerStep: 1
  },
  'aether-field-tank': {
    id: 'aether-field-tank', name: 'Aether-Field Tank', locomotion: 'tracked',
    hp: 85, armour: 1.00, driveStep: 4, maxClimb: 12, fuel: 90, fuelPerStep: 1,
    // Comes back each round with its own field already lit.
    fieldRegen: 25
  },
  'scout-drone': {
    id: 'scout-drone', name: 'Scout Drone', locomotion: 'hover',
    hp: 60, armour: 1.35, driveStep: 8, maxClimb: 22, fuel: 160, fuelPerStep: 1,
    hoverClearance: 18
  }
};

const CHASSIS_IDS = Object.keys(CHASSIS);

// What a player gets if they never touch the selector, and the fallback for
// any chassis id the server does not recognise.
//
// It is also the ONLY chassis classic mode allows, and not by coincidence: its
// simulation numbers (tracked, driveStep 4, maxClimb 10, fuel 100, armour 1.0)
// are exactly the original CONST.DRIVE_STEP / MAX_CLIMB / FUEL_PER_ROUND the
// game shipped with, so a classic tank moves bit-for-bit as it always has.
const DEFAULT_CHASSIS = 'clockwork-tank';

// Which chassis each mode may field. Classic gets the one original tank —
// that is a large part of what makes it the original — and Aethercastle gets
// the full stable. Enforced server-side in setProfile, because a modified
// client sending 'airship-platform' into a classic room would have every other
// client simulating a vehicle that mode is not supposed to contain.
const MODE_CHASSIS = {
  aethercastle: CHASSIS_IDS,
  classic: [DEFAULT_CHASSIS]
};

function chassisAllowedIn(mode, chassisId) {
  return MODE_CHASSIS[normaliseMode(mode)].includes(chassisId);
}

module.exports = {
  RETRO_COLORS,
  AETHERCASTLE_COLORS,
  CLASSIC_COLORS,
  PALETTES,
  paletteFor,
  GAME_MODES,
  DEFAULT_MODE,
  isGameMode,
  normaliseMode,
  MAX_PLAYERS,
  WORLD_W,
  WORLD_MARGIN,
  WEAPON_IDS,
  BASIC_WEAPON_IDS,
  CHASSIS,
  CHASSIS_IDS,
  DEFAULT_CHASSIS,
  MODE_CHASSIS,
  chassisAllowedIn
};
