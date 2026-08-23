const DS = window.AethercastleDesignSystem_42f734;

const PLAYERS = [
  { slot: 1, name: 'Sir Aldric', color: 'var(--player-1)', kind: 'human', chassis: 'Clockwork Tank · Brass-plated', sprite: 'clockwork-tank', hp: 74, shield: 60, shieldMax: 100, cash: 10000, kills: 3, damage: 412, x: 12, ready: true, host: true, you: true },
  { slot: 2, name: 'Dame Oriel', color: 'var(--player-2)', kind: 'human', chassis: 'Walker Mech · Aether-field', sprite: 'walker-mech', hp: 38, shield: 0, shieldMax: 0, cash: 8100, kills: 2, damage: 288, x: 38, ready: true },
  { slot: 3, name: 'Provost Kell', color: 'var(--player-3)', kind: 'ai', chassis: 'Half-track Artillery · Poolshark', sprite: 'brass-plated-tank', hp: 92, shield: 0, shieldMax: 0, cash: 6400, kills: 1, damage: 96, x: 64, ready: true },
  { slot: 4, name: 'Magister Vane', color: 'var(--player-4)', kind: 'ai', chassis: 'Airship Platform · Cyborg', sprite: 'airship-platform', hp: 0, shield: 0, shieldMax: 0, cash: 3600, kills: 1, damage: 140, x: 88, ready: true, eliminated: true }
];

const ARSENAL = [
  { name: 'Steam Mortar', sprite: 'steam-mortar', tier: 1, family: 'Direct', cost: 0, packSize: 1, blast: 30, damage: 60, owned: Infinity, description: 'Boiler-fed shell, free forever. Still ends careless commanders.' },
  { name: 'Alchemical Shell', sprite: 'phosphorus-cannon', tier: 1, family: 'Direct', cost: 500, packSize: 5, blast: 40, damage: 80, owned: 4, description: 'Standard guild munition. Reliable, unglamorous, always in stock.' },
  { name: 'Clockwork Harpoon', sprite: 'clockwork-harpoon', tier: 2, family: 'Rolling', cost: 1000, packSize: 5, blast: 20, damage: 40, owned: 2, description: 'Bites the slope and runs downhill until it finds a hull.' },
  { name: 'Acid Rounds', sprite: 'acid-rounds', tier: 2, family: 'Corrosive', cost: 1500, packSize: 4, blast: 15, damage: 5, owned: 0, description: 'Eats plate over three turns. Cheap punishment for entrenchment.' },
  { name: 'Tesla Coil Cannon', sprite: 'tesla-coil-cannon', tier: 2, family: 'Beam', cost: 2500, packSize: 3, blast: 30, damage: 60, owned: 1, description: 'No arc, no wind — but a hill will drink the whole discharge.' },
  { name: 'Sandstorm', sprite: 'siege-loot', tier: 2, family: 'Terraform', cost: 2000, packSize: 3, blast: 0, damage: 0, owned: 0, description: 'Buries a valley. Damage nil; humiliation total.' },
  { name: 'Aether Cluster', sprite: 'sonic-disruptor', tier: 3, family: 'Sub-munition', cost: 3000, packSize: 2, blast: 25, damage: 50, owned: 0, description: 'Splits into five at apex. Spread widens with power.' },
  { name: 'Aether-Strike Missile', sprite: 'aether-strike-missile', tier: 3, family: 'Direct', cost: 5000, packSize: 1, blast: 100, damage: 200, owned: 0, description: 'Guild-sanctioned overkill. One shot, one crater, one grudge.' },
  { name: 'Void Bomb', sprite: 'void-bomb', tier: 4, family: 'Exotic', cost: 6000, packSize: 1, blast: 35, damage: 70, owned: 0, description: 'Collapses a pocket of aether; terrain falls inward instead of out.' },
  { name: 'Aether-Nuke', sprite: 'aether-nuke', tier: 4, family: 'Cataclysmic', cost: 10000, packSize: 1, blast: 150, damage: 300, owned: 0, description: 'Critical fission element, brass casing, no second chances.' }
];

const DEFENSES = [
  { name: 'Aether Shield', sprite: 'shield-dome', tier: 1, cost: 1000, packSize: 1, owned: 1 },
  { name: 'Hardened Shield', sprite: 'shield-dome', tier: 2, cost: 2500, packSize: 1, owned: 0 },
  { name: 'Aether-Field Generator', sprite: 'aether-field-tank', tier: 3, cost: 4000, packSize: 1, owned: 0 },
  { name: 'Fusion Battery', sprite: 'fusion-bottle', tier: 1, cost: 500, packSize: 2, owned: 3 },
  { name: 'Parachute Silk', sprite: 'guild-expedition', tier: 1, cost: 500, packSize: 3, owned: 2 },
  { name: 'Guidance Orrery', sprite: 'aether-radar', tier: 2, cost: 2000, packSize: 1, owned: 0 },
  { name: 'Auto Defense', sprite: 'repair-bay', tier: 2, cost: 3000, packSize: 1, owned: 0 }
];

const LOADOUT = [
  { name: 'Steam Mortar', sprite: 'steam-mortar', ammo: Infinity, tier: 1 },
  { name: 'Clockwork Harpoon', sprite: 'clockwork-harpoon', ammo: 2, tier: 2 },
  { name: 'Tesla Coil Cannon', sprite: 'tesla-coil-cannon', ammo: 1, tier: 2 },
  { name: 'Void Bomb', sprite: 'void-bomb', ammo: 1, tier: 4 }
];

const ROOMS = [
  { host: 'Dame Oriel', players: 2, maxPlayers: 4, biome: 'Plateau', rounds: 5 },
  { host: 'Provost Kell', players: 4, maxPlayers: 4, biome: 'Mountains', rounds: 3 },
  { host: 'Brother Anselm', players: 1, maxPlayers: 4, biome: 'Plains', rounds: 10 }
];

Object.assign(window, { DS, PLAYERS, ARSENAL, DEFENSES, LOADOUT, ROOMS });
