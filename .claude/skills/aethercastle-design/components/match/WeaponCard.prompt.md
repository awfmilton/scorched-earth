Two views of one purchasable: `WeaponCard` for the featured grid, `ShopRow` for the dense parchment catalogue.

```jsx
<WeaponCard name="Void Bomb" sprite="void-bomb" tier={4} family="Exotic"
  cost={6000} packSize={1} blast={35} damage={70} affordable={cash>=6000}
  description="Collapses a pocket of aether; terrain falls inward instead of out." onBuy={buy} />
<ShopRow name="Steam Mortar" sprite="steam-mortar" tier={1} cost={0} packSize={1} owned={Infinity} />
```

Cards live on plate; rows live on parchment (they inherit ink colours). Price goes blood-red and the action falls back to `ghost` when `affordable` is false — never hide unaffordable stock.
