The complete battle HUD strip — put it directly above the battlefield canvas.

```jsx
<HudStrip player={{name:'Sir Aldric',color:'var(--player-1)',hp:74,shield:60,shieldMax:100,angle:45,power:500,cash:10000}}
  weapons={arsenal} weaponIndex={i} onCycle={setI} wind={-18} netState="live" />
```

Order is fixed: commander + hull, instruments (angle, power, cash, wind), ordnance carousel, net state, key legend. Don't reorder — players read it positionally.
