import React from 'react';
import { Badge } from '../core/Badge.jsx';
import { HpBar } from '../hud/HudReadout.jsx';
import { IconTile } from '../core/IconTile.jsx';

/** One of four lobby slots: filled, empty, or an AI seat. */
export function LobbySlot({ index = 1, name, color = 'var(--player-1)', chassis, chassisSprite, kind = 'empty', host, ready, you, onInvite, style }) {
  const empty = kind === 'empty';
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 'var(--space-6)', minHeight: 'var(--slot-height)',
      padding: 'var(--space-5) var(--gutter-panel)',
      background: empty ? 'var(--surface-inset)' : 'var(--plate)',
      border: `var(--border-hair) ${empty ? 'dashed' : 'solid'} ${empty ? 'var(--stone-500)' : color}`,
      borderLeft: `4px solid ${empty ? 'var(--stone-600)' : color}`,
      borderRadius: 'var(--radius-plate)',
      boxShadow: empty ? 'var(--bevel-inset)' : `var(--bevel-raised), inset 0 0 26px -12px ${color}`, ...style
    }}>
      <span className="ac-readout" style={{ color: empty ? 'var(--stone-500)' : color, fontSize: 'var(--text-lg)', width: 24 }}>{index}</span>
      {empty ? (
        <>
          <span style={{ font: 'var(--type-body-sm)', fontStyle: 'italic', color: 'var(--stone-400)' }}>Seat open — awaiting a commander</span>
          {onInvite && <button onClick={onInvite} className="ac-label" style={{ marginLeft: 'auto', background: 'transparent', border: 'var(--border-hair) solid var(--brass-700)', color: 'var(--brass-300)', padding: '5px var(--space-5)', cursor: 'pointer' }}>Add AI</button>}
        </>
      ) : (
        <>
          {chassisSprite && <IconTile sprite={chassisSprite} size={40} fit="contain" />}
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
              <strong className="ac-banner" style={{ color, fontSize: 'var(--text-sm)' }}>{name}</strong>
              {you && <Badge tone="cyan">You</Badge>}
              {host && <Badge tone="brass">Host</Badge>}
              {kind === 'ai' && <Badge tone="violet">AI</Badge>}
            </div>
            <span className="ac-label" style={{ color: 'var(--stone-300)' }}>{chassis}</span>
          </div>
          <Badge tone={ready ? 'acid' : 'stone'} solid={ready}>{ready ? 'Ready' : 'Standing by'}</Badge>
        </>
      )}
    </div>
  );
}

/** Public room browser row. */
export function RoomListRow({ host, players = 1, maxPlayers = 4, biome, rounds, onJoin, style }) {
  const [hover, setHover] = React.useState(false);
  const full = players >= maxPlayers;
  return (
    <div onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} style={{
      display: 'flex', alignItems: 'center', gap: 'var(--space-6)', minHeight: 'var(--row-height)',
      padding: '0 var(--space-6)', background: hover ? 'rgba(0,191,255,.06)' : 'transparent',
      borderBottom: 'var(--border-dashed-etch)', ...style
    }}>
      <div style={{ minWidth: 0, flex: 1 }}>
        <strong style={{ font: 'var(--type-body-sm)', fontWeight: 600, color: 'var(--parchment-100)' }}>{host}’s keep</strong>
        <div className="ac-label" style={{ color: 'var(--stone-400)', marginTop: 1 }}>{biome} · {rounds} rounds</div>
      </div>
      <span className="ac-readout" style={{ color: full ? 'var(--blood-500)' : 'var(--cyan-400)', fontSize: 'var(--text-sm)' }}>{players}/{maxPlayers}</span>
      <button onClick={onJoin} disabled={full} className="ac-label" style={{
        background: full ? 'transparent' : 'linear-gradient(180deg,var(--cyan-500),var(--cyan-700))',
        color: full ? 'var(--stone-400)' : 'var(--void-900)', border: `var(--border-hair) solid ${full ? 'var(--stone-500)' : 'var(--cyan-400)'}`,
        padding: '6px var(--space-6)', cursor: full ? 'not-allowed' : 'pointer', borderRadius: 'var(--radius-plate)'
      }}>{full ? 'Full' : 'Join'}</button>
    </div>
  );
}

/** Round-end / leaderboard row. Rank 1–3 gets a gilded rank plate. */
export function StandingsRow({ rank = 1, name, color = 'var(--player-1)', hp, kills = 0, cash = 0, damage, eliminated, variant = 'standings', style }) {
  const gild = rank <= 3;
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 'var(--space-6)', minHeight: 'var(--row-height)',
      padding: '0 var(--space-6)', background: rank % 2 ? 'rgba(8,7,10,.25)' : 'transparent',
      borderLeft: `3px solid ${eliminated ? 'var(--stone-600)' : color}`,
      borderBottom: 'var(--border-etch-line)', opacity: eliminated ? .6 : 1, ...style
    }}>
      <span className="ac-readout" style={{
        width: 30, height: 24, display: 'grid', placeItems: 'center', fontSize: 'var(--text-sm)',
        background: gild ? 'var(--brass-rail)' : 'var(--void-800)', color: gild ? 'var(--void-900)' : 'var(--stone-300)',
        border: `var(--border-hair) solid ${gild ? 'var(--brass-300)' : 'var(--stone-600)'}`
      }}>{rank}</span>
      <strong className="ac-banner" style={{ color, fontSize: 'var(--text-sm)', flex: 1, minWidth: 0 }}>{name}</strong>
      {variant === 'standings' && hp !== undefined && <HpBar hp={hp} width={92} compact />}
      <span className="ac-readout" style={{ color: 'var(--magenta-500)', fontSize: 'var(--text-sm)', minWidth: 44 }}>{kills} K</span>
      {damage !== undefined && <span className="ac-readout" style={{ color: 'var(--cyan-400)', fontSize: 'var(--text-sm)', minWidth: 62 }}>{damage} dmg</span>}
      <span className="ac-readout" style={{ color: 'var(--cash)', fontSize: 'var(--text-sm)', minWidth: 78, textAlign: 'right' }}>${cash.toLocaleString()}</span>
    </div>
  );
}
