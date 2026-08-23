Square-tick radio row and brass ratchet switch for room rules and settings.

```jsx
<RadioGroup label="Weapons" name="weapons" value={w} onChange={setW}
  options={[{value:'all',label:'All'},{value:'basic',label:'Basic'}]} />
<Switch label="Friendly fire" checked={ff} onChange={setFf} />
```

Radios are squares, never circles — selected state is a solid cyan square with a cyan glow. The switch knob slides on `--ease-ratchet` (mechanical, no bounce).
