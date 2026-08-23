The three battle-HUD instruments: numeric readout cell, hull/shield bar, wind gauge.

```jsx
<HudReadout label="Angle" value={45} unit="°" emphasis />
<HudReadout label="Cash" value="$10,000" tone="brass" />
<HpBar hp={68} shield={40} shieldMax={100} />
<WindGauge value={-18} />
```

Every number the player reads uses `HudReadout` (mono, tabular). HP colour steps automatically: acid >60%, fire >30%, blood below. Wind is always centre-zero with direction shown by which side the needle grows on.
