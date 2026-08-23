The battle-HUD ordnance carousel — mirrors the `[` / `]` / Tab cycle keys.

```jsx
<WeaponSelector index={i} onCycle={setI} weapons={[
  { name: 'Steam Mortar', sprite: 'steam-mortar', ammo: Infinity, tier: 1 },
  { name: 'Void Bomb', sprite: 'void-bomb', ammo: 2, tier: 4 }
]} />
```

Ammo of `Infinity` prints ∞ in acid green (the free starter round). Tier 3–4 ordnance gets an aether glow on its sprite tile.
