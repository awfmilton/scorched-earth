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

module.exports = {
  RETRO_COLORS,
  MAX_PLAYERS
};
