        buy(tank, id, packs = 1) {
          const config = WEAPONS.find(w => w.id === id) || ITEMS.find(i => i.id === id);
          if (!config) return false;

          const totalCost = config.cost * packs;
          if (tank.cash < totalCost) return false;

          tank.cash -= totalCost;
          tank.inventory = tank.inventory || {};
          tank.inventory[id] = (tank.inventory[id] || 0) + (config.packSize * packs);

          if (!this.headless) sfx('buy');
          return true;
        }

        sell(tank, id, itemsToSell = 1) {
          const config = WEAPONS.find(w => w.id === id) || ITEMS.find(i => i.id === id);
          if (!config) return false;

          tank.inventory = tank.inventory || {};
          const owned = tank.inventory[id] || 0;
          if (owned < itemsToSell) return false;

          // Sell price is proportional to pack size. 
          const pricePerItem = Math.floor(config.cost / config.packSize);
          tank.cash += pricePerItem * itemsToSell;
          tank.inventory[id] -= itemsToSell;

          if (!this.headless) sfx('buy');
          return true;
        }
