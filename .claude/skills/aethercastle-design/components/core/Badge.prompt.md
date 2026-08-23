Tier and status markers, plus the room share-code chip.

```jsx
<Badge tier={3}>Cataclysmic</Badge>
<Badge tone="acid" solid>Ready</Badge>
<Badge tone="stone" pill>Waiting</Badge>
<ShareCodeChip code="VLTK" onCopy={copy} />
```

`tier` is the canonical way to colour ordnance: T1 brass, T2 cyan, T3 magenta, T4 violet/void. Use `tone="blood"` only for elimination and forfeits.
