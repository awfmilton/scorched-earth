// CGA/EGA-inspired retro colors
const RETRO_COLORS = [
  { value: '#ff00ff', name: 'Magenta' },
  { value: '#00ffff', name: 'Cyan' },
  { value: '#ff2222', name: 'Red' },
  { value: '#22ff22', name: 'Green' },
  { value: '#ffff00', name: 'Yellow' },
  { value: '#2222ff', name: 'Blue' },
  { value: '#ff8800', name: 'Orange' },
  { value: '#ffffff', name: 'White' }
];

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

module.exports = {
  RETRO_COLORS,
  MAX_PLAYERS,
  WORLD_W,
  WORLD_MARGIN,
  WEAPON_IDS,
  BASIC_WEAPON_IDS
};
