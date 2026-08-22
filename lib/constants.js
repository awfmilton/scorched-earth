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

module.exports = {
  RETRO_COLORS,
  MAX_PLAYERS,
  WORLD_W,
  WORLD_MARGIN
};
