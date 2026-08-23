import React from 'react';
import { IconTile } from '../core/IconTile.jsx';

/** In-battle weapon carousel: current ordnance plus ammo, with cycle affordances. */
export function WeaponSelector({ weapons = [], index = 0, onCycle, style }) {
  const w = weapons[index] || {};
  const cyc = d => onCycle && onCycle((index + d + weapons.length) % weapons.length);
  const arrow = (glyph, d) => (
    <button onClick={() => cyc(d)} className="ac-label" aria-label={d > 0 ? 'Next weapon' : 'Previous weapon'} style={{
      width: 24, alignSelf: 'stretch', background: 'var(--plate)', color: 'var(--brass-300)',
      border: 'var(--border-hair) solid var(--border-brass-dim)', cursor: 'pointer', fontSize: 'var(--text-sm)'
    }}>{glyph}</button>
  );
  return (
    <div style={{
      display: 'flex', alignItems: 'stretch', gap: 0, background: 'var(--surface-inset)',
      border: `var(--border-hair) solid var(--brass-600)`, boxShadow: 'var(--bevel-inset)', ...style
    }}>
      {arrow('[', -1)}
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-5)', padding: 'var(--space-3) var(--space-6)', minWidth: 208 }}>
        <IconTile sprite={w.sprite} size={32} tier={w.tier} glow={w.tier >= 3 ? 'magenta' : undefined} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          <span className="ac-label" style={{ color: 'var(--brass-400)' }}>Ordnance</span>
          <span style={{ font: 'var(--type-section)', color: 'var(--parchment-100)', lineHeight: 1 }}>{w.name}</span>
        </div>
        <span className="ac-readout" style={{
          marginLeft: 'auto', padding: '2px var(--space-4)', borderRadius: 'var(--radius-pill)',
          background: 'var(--void-800)', border: 'var(--border-hair) solid var(--brass-700)',
          color: w.ammo === Infinity ? 'var(--acid-400)' : 'var(--cyan-400)', fontSize: 'var(--text-sm)'
        }}>{w.ammo === Infinity ? '∞' : `×${w.ammo}`}</span>
      </div>
      {arrow(']', 1)}
    </div>
  );
}
