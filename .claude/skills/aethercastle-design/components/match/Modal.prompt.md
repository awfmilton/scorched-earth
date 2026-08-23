Scrimmed dialog for anything that interrupts the battle — armory, settings, round standings, forfeit.

```jsx
<Modal kicker="Intermission · Round 3 of 5" title="Aether Forge" surface="parchment"
  onClose={close} footer={<Button variant="primary">Done</Button>}>
  …ShopRow list…
</Modal>
```

The scrim is `--surface-scrim` plus a 6px backdrop blur — the battlefield stays visible underneath. Modal frames are always `3px double` brass, matching the setup dialogs in the source engine.
