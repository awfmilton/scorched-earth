The standard Aethercastle action control — use for every commit action (fire, buy, create match, start game).

```jsx
<Button variant="primary" size="lg" block>Create Private Match</Button>
<Button variant="secondary">Join</Button>
<Button variant="gild" size="sm">Buy</Button>
<Button variant="ghost" size="sm">Refresh List</Button>
```

Variants: `primary` (aether magenta — one per screen), `secondary` (cyan, telemetry/joins), `gild` (brass, anything money-related), `plate` (neutral chrome), `ghost` (tertiary), `danger` (forfeit/destroy). Sizes `sm|md|lg` map to 30/40/52px. Hover brightens and lights the variant glow; press sinks with an inset bevel — never scales.
