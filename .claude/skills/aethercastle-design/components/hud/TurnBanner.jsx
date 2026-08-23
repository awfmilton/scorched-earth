import React from 'react';

/** Full-width turn handoff banner. Sweeps in on the player's colour. */
export function TurnBanner({ player = 'Player 1', color = 'var(--player-1)', subtitle, timer, phase = 'turn', style }) {
  const label = phase === 'turn' ? 'Now firing' : phase === 'intermission' ? 'Intermission' : phase === 'round' ? 'Round begins' : 'Standings';
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 'var(--space-7)', height: 'var(--banner-height)',
      padding: '0 var(--gutter-panel)', background: 'var(--banner-fill)',
      borderTop: `var(--border-hair) solid var(--brass-700)`, borderBottom: `var(--border-plate) solid ${color}`,
      boxShadow: `0 2px 0 rgba(8,7,10,.6), inset 0 0 24px -8px ${color}`,
      animation: `ac-turn-sweep var(--dur-slow) var(--ease-ratchet)`, overflow: 'hidden', ...style
    }}>
      <span style={{ width: 6, alignSelf: 'stretch', background: color, boxShadow: `0 0 12px ${color}` }} />
      <span className="ac-label" style={{ color: 'var(--brass-400)' }}>{label}</span>
      <strong className="ac-banner" style={{ color, textShadow: `0 0 10px ${color}` }}>{player}</strong>
      {subtitle && <span style={{ font: 'var(--type-body-sm)', color: 'var(--text-on-plate-muted)' }}>{subtitle}</span>}
      {timer !== undefined && (
        <span className="ac-readout" style={{ marginLeft: 'auto', color: timer <= 5 ? 'var(--blood-500)' : 'var(--cyan-400)', fontSize: 'var(--text-lg)' }}>
          0:{String(timer).padStart(2, '0')}
        </span>
      )}
    </div>
  );
}

/** Kill-feed / event toast. Stack top-right during a round. */
export function KillFeedToast({ actor, actorColor = 'var(--player-1)', verb = 'obliterated', target, targetColor = 'var(--player-2)', weapon, damage, tone = 'damage', style }) {
  const edge = tone === 'heal' ? 'var(--heal)' : tone === 'info' ? 'var(--cyan-500)' : 'var(--damage)';
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 'var(--space-4)',
      padding: 'var(--space-4) var(--space-6)', background: 'rgba(15,13,20,.92)',
      borderLeft: `3px solid ${edge}`, border: 'var(--border-hair) solid var(--stone-600)', borderLeftWidth: 3,
      boxShadow: 'var(--shadow-toast)', font: 'var(--type-body-sm)', color: 'var(--text-on-plate)',
      animation: `ac-toast-in var(--dur-base) var(--ease-mech)`, backdropFilter: 'var(--blur-glass)', ...style
    }}>
      <strong style={{ color: actorColor }}>{actor}</strong>
      <span style={{ color: 'var(--text-on-plate-muted)' }}>{verb}</span>
      {target && <strong style={{ color: targetColor }}>{target}</strong>}
      {weapon && <span className="ac-label" style={{ color: 'var(--brass-400)' }}>{weapon}</span>}
      {damage !== undefined && <span className="ac-readout" style={{ color: edge, fontSize: 'var(--text-sm)' }}>−{damage}</span>}
    </div>
  );
}
