          // Table Headers
          const headers = ['Item / Weapon', 'Cost', 'Pack Size', 'Owned', 'Action'];
          headers.forEach(hText => {
            const h = document.createElement('div');
            h.textContent = hText.toUpperCase();
            h.style.fontWeight = 'bold';
            h.style.color = player.color;
            h.style.borderBottom = '1px solid ' + player.color;
            h.style.paddingBottom = '5px';
            grid.appendChild(h);
          });

          // Filter weapons if basicOnly is checked
          const isBasicOnly = this.config && this.config.weaponsAvailability === 'basic';
          const BASIC_WEAPONS = ['Baby Missile', 'Missile', 'Tracer'];

          const availableWeapons = WEAPONS.filter(w => {
            if (isBasicOnly) {
              return BASIC_WEAPONS.includes(w.id);
            }
            return true;
          });

          const availableItems = ITEMS;

          // Add a state to store bulk amount in the opts
          opts.bulkMultiplier = opts.bulkMultiplier || 1;

          // Helper to add rows
          const addRow = (itemConf) => {
            // Name
            const nameDiv = document.createElement('div');
            nameDiv.textContent = itemConf.name;
            nameDiv.style.color = '#fff';

            // Cost
            const costDiv = document.createElement('div');
            costDiv.textContent = `$${itemConf.cost}`;
            costDiv.style.color = '#00ff00';

            // Pack Size
            const sizeDiv = document.createElement('div');
            sizeDiv.textContent = itemConf.packSize;
            sizeDiv.style.color = '#888';

            // Owned Count
            const ownedDiv = document.createElement('div');
            const count = player.inventory[itemConf.id] !== undefined ? player.inventory[itemConf.id] : 0;
            ownedDiv.textContent = count === Infinity ? 'INF' : count;
            ownedDiv.style.color = '#888';

            // Actions
            const actionsDiv = document.createElement('div');
            actionsDiv.style.display = 'flex';
            actionsDiv.style.gap = '5px';

            const buyBtn = document.createElement('button');
            buyBtn.textContent = opts.bulkMultiplier > 1 ? `BUY x${opts.bulkMultiplier}` : 'BUY';
            buyBtn.style.fontFamily = 'inherit';
            buyBtn.style.padding = '4px 8px';
            buyBtn.style.border = '1px solid ' + player.color;
            buyBtn.style.background = 'transparent';
            buyBtn.style.color = player.color;
            buyBtn.style.cursor = 'pointer';

            if (player.cash < itemConf.cost * opts.bulkMultiplier) {
              buyBtn.disabled = true;
              buyBtn.style.borderColor = '#444';
              buyBtn.style.color = '#444';
              buyBtn.style.cursor = 'not-allowed';
            } else {
              buyBtn.addEventListener('click', () => {
                if (this.buy(player, itemConf.id, opts.bulkMultiplier)) {
                  this.showShopForPlayer(playerIdx, opts);
                }
              });
            }
            
            const sellBtn = document.createElement('button');
            const itemsToSell = itemConf.packSize * opts.bulkMultiplier;
            sellBtn.textContent = opts.bulkMultiplier > 1 ? `SELL x${opts.bulkMultiplier}` : 'SELL';
            sellBtn.style.fontFamily = 'inherit';
            sellBtn.style.padding = '4px 8px';
            sellBtn.style.border = '1px solid #ff4444';
            sellBtn.style.background = 'transparent';
            sellBtn.style.color = '#ff4444';
            sellBtn.style.cursor = 'pointer';

            if (count === Infinity || count < itemsToSell || isBasicOnly) {
              // Can't sell basic items in basic mode? Or can't sell infinite items.
              // We'll just disable if not enough owned.
              sellBtn.disabled = true;
              sellBtn.style.borderColor = '#444';
              sellBtn.style.color = '#444';
              sellBtn.style.cursor = 'not-allowed';
            } else {
              sellBtn.addEventListener('click', () => {
                if (this.sell(player, itemConf.id, itemsToSell)) {
                  this.showShopForPlayer(playerIdx, opts);
                }
              });
            }

            actionsDiv.appendChild(buyBtn);
            if (count !== Infinity) {
              actionsDiv.appendChild(sellBtn);
            }

            grid.appendChild(nameDiv);
            grid.appendChild(costDiv);
            grid.appendChild(sizeDiv);
            grid.appendChild(ownedDiv);
            grid.appendChild(actionsDiv);
          };
