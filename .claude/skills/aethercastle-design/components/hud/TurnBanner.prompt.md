Phase/turn banner and the kill-feed toast — the two things that tell the player what just happened.

```jsx
<TurnBanner player="Sir Aldric" color="var(--player-1)" subtitle="Human · shot 1" timer={24} />
<KillFeedToast actor="Sir Aldric" verb="obliterated" target="Magister Vane" weapon="Aether-Nuke" damage={112} />
```

The banner's bottom edge and glow always take the active player's identity colour. Toasts stack top-right, newest first, and animate in on `ac-toast-in`; never more than four at once.
