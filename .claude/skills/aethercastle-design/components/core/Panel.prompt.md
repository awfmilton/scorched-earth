The system's container primitive, plus the gilded section nameplate.

```jsx
<Panel kicker="Round 3 of 5" title="Aether Forge" accent="magenta" actions={<Button size="sm" variant="ghost">Close</Button>}>
  …
</Panel>
<Panel surface="parchment" title="Battle Orders">…</Panel>
<SectionBanner accent="cyan">Fortress Defenses</SectionBanner>
```

Choose `plate` for chrome and lists, `parchment` for prose the player actually reads (shop descriptions, briefs, rules). Use `pad={false}` when the child is a flush table of `ShopRow`/`StandingsRow`.
