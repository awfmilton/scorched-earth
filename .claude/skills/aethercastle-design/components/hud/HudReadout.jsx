import React from 'react';

/** One HUD cell: brass label + mono value. The atom the battle strip is built from. */
export function HudReadout({ label, value, unit, tone = 'cyan', size = 'md', emphasis, style }) {
  const color = tone === 'magenta' ? 'var(--magenta-500)' : tone === 'brass' ? 'var(--brass-300)' : tone === 'acid' ? 'var(--acid-400)' : tone === 'blood' ? 'var(--blood-500)' : 'var(--cyan-400)';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 62, ...style }}>
      <span className="ac-label" style={{ color: 'var(--brass-400)', fontSize: 'var(--text-2xs)' }}>{label}</span>
      <span className="ac-readout" style={{
        color, fontSize: size === 'lg' ? 'var(--text-lg)' : size === 'sm' ? 'var(--text-sm)' : 'var(--text-md)',
        textShadow: emphasis ? (tone === 'magenta' ? 'var(--glow-text-magenta)' : 'var(--glow-text-cyan)') : 'none'
      }}>{value}{unit && <span style={{ color: 'var(--stone-400)', fontSize: '.7em', marginLeft: 2 }}>{unit}</span>}</span>
    </div>
  );
}

/** Hull-integrity bar. Fill colour steps acid → fire → blood as HP falls; shield rides on top. */
export function HpBar({ hp = 100, max = 100, shield = 0, shieldMax = 0, width = 160, compact, label, style }) {
  const pct = Math.max(0, Math.min(1, hp / max));
  const fill = pct > .6 ? 'var(--hp-full)' : pct > .3 ? 'var(--hp-mid)' : 'var(--hp-low)';
  return (
    <div style={{ width, ...style }}>
      {!compact && (
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
          <span className="ac-label" style={{ color: 'var(--brass-400)' }}>{label || 'Hull'}</span>
          <span className="ac-readout" style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-on-plate-muted)' }}>{hp}/{max}</span>
        </div>
      )}
      <div style={{ height: compact ? 6 : 10, background: 'var(--surface-inset)', border: 'var(--border-hair) solid var(--border-brass-dim)', boxShadow: 'var(--bevel-inset)', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0, width: `${pct * 100}%`, background: fill, transition: `width var(--dur-base) var(--ease-mech)` }} />
        <div style={{ position: 'absolute', inset: 0, background: 'var(--scanline)', opacity: .5 }} />
      </div>
      {shieldMax > 0 && (
        <div style={{ height: 4, marginTop: 2, background: 'var(--surface-inset)', border: 'var(--border-hair) solid var(--cyan-700)', position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', inset: 0, width: `${Math.max(0, Math.min(1, shield / shieldMax)) * 100}%`, background: 'var(--shield-charge)', boxShadow: 'var(--glow-cyan)' }} />
        </div>
      )}
    </div>
  );
}

/** Wind gauge: brass dial with a cyan needle. Direction is the sign of `value`. */
export function WindGauge({ value = 0, maxValue = 60, width = 132, style }) {
  const dir = value === 0 ? 0 : value > 0 ? 1 : -1;
  const mag = Math.min(1, Math.abs(value) / maxValue);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)', ...style }}>
      <span className="ac-label" style={{ color: 'var(--brass-400)' }}>Wind</span>
      <div style={{ width, height: 14, position: 'relative', background: 'var(--surface-inset)', border: 'var(--border-hair) solid var(--border-brass-dim)', boxShadow: 'var(--bevel-inset)' }}>
        <span style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: 1, background: 'var(--brass-600)' }} />
        <span style={{
          position: 'absolute', top: 2, bottom: 2, background: 'var(--wind-marker)', boxShadow: 'var(--glow-cyan)',
          left: dir >= 0 ? '50%' : `${50 - mag * 50}%`, width: `${mag * 50}%`,
          transition: `all var(--dur-base) var(--ease-mech)`
        }} />
      </div>
      <span className="ac-readout" style={{ color: 'var(--cyan-400)', fontSize: 'var(--text-sm)', minWidth: 46 }}>
        {dir === 0 ? '—' : dir > 0 ? '▶' : '◀'} {Math.abs(value)}
      </span>
    </div>
  );
}
