Recessed text field (and its matching `Select`) for room setup, join-by-code and settings.

```jsx
<Input label="Commander" placeholder="Sir Aldric" />
<Input label="Join code" code maxLength={4} placeholder="ABCD" />
<Input label="Starting cash" mono defaultValue="10000" />
<Select label="Wall type" options={[{value:'off',label:'Off'},{value:'rubber',label:'Rubber (bouncing)'}]} />
```

Fields are always inset (never raised). Focus draws a cyan hairline plus cyan glow; `invalid` swaps to blood red and tints the hint.
