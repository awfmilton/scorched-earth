The three roster row types: lobby seat, public room browser row, standings/leaderboard row.

```jsx
<LobbySlot index={1} name="Sir Aldric" color="var(--player-1)" kind="human" host you ready
  chassis="Clockwork Tank · Brass-plated" chassisSprite="clockwork-tank" />
<LobbySlot index={4} kind="empty" onInvite={addAi} />
<RoomListRow host="Dame Oriel" players={2} maxPlayers={4} biome="Plateau" rounds={5} onJoin={join} />
<StandingsRow rank={1} name="Sir Aldric" hp={74} kills={3} damage={412} cash={12400} />
```

Slots and standings rows are always keyed by the player's identity colour on the left edge. Use `variant="leaderboard"` (and omit `hp`) for the global ledger.
