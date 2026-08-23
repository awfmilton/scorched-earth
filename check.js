const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');
const lines = html.split('\n');

function find(query) {
    const idx = lines.findIndex(l => l.includes(query));
    if (idx !== -1) return `${idx + 1}: ${lines[idx].trim()}`;
    return 'MISSING';
}

console.log('1. shop:', find('id="shop"'));
console.log('2. WEAPONS:', find('const WEAPONS') || find('WEAPONS =') || find('let WEAPONS'));
console.log('3. ITEMS:', find('const ITEMS') || find('ITEMS =') || find('let ITEMS'));
console.log('4. basic weapons:', find('basic'));
console.log('4. weaponsAvailability:', find('weaponsAvailability'));
console.log('5. Game.start:', find('start('));
console.log('5. this.config:', find('this.config ='));
console.log('5. this.roster:', find('this.roster ='));
console.log('5. this.currentRound:', find('this.currentRound ='));
console.log('6. damageDealt:', find('damageDealt'));
console.log('6. kills:', find('kills'));
console.log('7. HP =:', find('hp =') || find('hp:'));
console.log('7. TANK_HP:', find('TANK_HP'));
console.log('8. anyTankFalling:', find('anyTankFalling'));
console.log('8. snapTanksToTerrain:', find('snapTanksToTerrain'));
console.log('8. raiseShieldForActivePlayer:', find('raiseShieldForActivePlayer'));
console.log('8. updateHUD:', find('updateHUD'));
console.log('8. newRound:', find('newRound'));
console.log('9. this.projectiles:', find('this.projectiles'));
console.log('9. this.projectile:', find('this.projectile'));
console.log('10. sfx:', find('sfx(') || find('function sfx'));
console.log('11. SCORCHED:', find('SCORCHED'));
console.log('11. createHeadlessGame:', find('createHeadlessGame'));
