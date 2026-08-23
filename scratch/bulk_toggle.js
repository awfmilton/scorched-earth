          // Bulk toggle
          const bulkDiv = document.createElement('div');
          bulkDiv.style.marginBottom = '10px';
          bulkDiv.style.display = 'flex';
          bulkDiv.style.gap = '10px';
          bulkDiv.style.alignItems = 'center';
          
          const bulkLabel = document.createElement('span');
          bulkLabel.textContent = 'QUANTITY:';
          bulkLabel.style.color = '#888';
          bulkLabel.style.fontWeight = 'bold';
          
          bulkDiv.appendChild(bulkLabel);
          
          [1, 5, 10].forEach(mult => {
            const mBtn = document.createElement('button');
            mBtn.textContent = `x${mult}`;
            mBtn.style.fontFamily = 'inherit';
            mBtn.style.padding = '4px 12px';
            mBtn.style.cursor = 'pointer';
            mBtn.style.border = '1px solid ' + (opts.bulkMultiplier === mult ? player.color : '#444');
            mBtn.style.background = opts.bulkMultiplier === mult ? player.color : 'transparent';
            mBtn.style.color = opts.bulkMultiplier === mult ? '#000' : '#888';
            
            mBtn.addEventListener('click', () => {
              opts.bulkMultiplier = mult;
              this.showShopForPlayer(playerIdx, opts);
            });
            bulkDiv.appendChild(mBtn);
          });
          
          container.appendChild(bulkDiv);

          // Grid container (scrollable)
          const gridWrapper = document.createElement('div');
