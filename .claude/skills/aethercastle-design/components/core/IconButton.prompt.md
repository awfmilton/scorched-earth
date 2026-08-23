Square chrome button for icon-only affordances in the HUD and modal headers (mute, settings, close, weapon cycle).

```jsx
<IconButton label="Mute" glyph={<i data-lucide="volume-2"></i>} />
<IconButton label="Settings" glyph={<i data-lucide="settings"></i>} active />
```

Always pass `label` — there is no visible text. `active` sinks the plate (inset bevel) and tints the glyph with the variant colour.
