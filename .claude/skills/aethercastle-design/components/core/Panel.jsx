import React from 'react';

/** Riveted plate panel, or a parchment sheet when surface="parchment". */
export function Panel({ title, kicker, actions, surface = 'plate', accent = 'brass', pad = true, children, style }) {
  const parchment = surface === 'parchment';
  const edge = accent === 'magenta' ? 'var(--magenta-600)' : accent === 'cyan' ? 'var(--cyan-500)' : accent === 'violet' ? 'var(--violet-600)' : 'var(--brass-500)';
  return (
    <section style={{
      background: parchment ? 'var(--parchment)' : 'var(--plate)',
      color: parchment ? 'var(--text-on-parchment)' : 'var(--text-on-plate)',
      border: `var(--border-plate) solid ${parchment ? 'var(--brass-600)' : edge}`,
      borderRadius: parchment ? 'var(--radius-sheet)' : 'var(--radius-plate)',
      boxShadow: parchment ? 'var(--shadow-sheet)' : 'var(--shadow-panel), var(--bevel-raised)',
      backgroundImage: parchment ? 'var(--parchment)' : `var(--scanline), var(--plate)`,
      overflow: 'hidden', ...style
    }}>
      {(title || actions) && (
        <header style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-6)',
          padding: 'var(--space-5) var(--gutter-panel)',
          background: parchment ? 'transparent' : 'var(--banner-fill)',
          borderBottom: `var(--border-hair) solid ${parchment ? 'var(--border-rule-ink)' : edge}`
        }}>
          <div>
            {kicker && <div className="ac-label" style={{ color: parchment ? 'var(--text-on-parchment-muted)' : 'var(--brass-400)', marginBottom: 2 }}>{kicker}</div>}
            {title && <h2 className="ac-banner" style={{ margin: 0, color: parchment ? 'var(--text-on-parchment)' : 'var(--parchment-100)' }}>{title}</h2>}
          </div>
          {actions && <div style={{ display: 'flex', gap: 'var(--space-4)', alignItems: 'center' }}>{actions}</div>}
        </header>
      )}
      <div style={{ padding: pad ? (parchment ? 'var(--gutter-parchment)' : 'var(--gutter-panel)') : 0 }}>{children}</div>
    </section>
  );
}

/** Brass-framed section banner: the little gilded nameplate between blocks. */
export function SectionBanner({ children, accent = 'magenta', style }) {
  const rail = accent === 'cyan' ? 'var(--cyan-500)' : accent === 'brass' ? 'var(--brass-500)' : 'var(--magenta-600)';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-5)', ...style }}>
      <span style={{ height: 2, flex: 1, background: `linear-gradient(90deg,transparent,${rail})`, boxShadow: accent === 'cyan' ? 'var(--glow-cyan)' : 'var(--glow-magenta)' }} />
      <span className="ac-banner" style={{
        padding: 'var(--space-3) var(--space-7)', background: 'var(--banner-fill)',
        border: `var(--border-hair) solid var(--brass-600)`, color: 'var(--parchment-100)',
        borderRadius: 'var(--radius-plate)', whiteSpace: 'nowrap'
      }}>{children}</span>
      <span style={{ height: 2, flex: 1, background: `linear-gradient(270deg,transparent,${rail})`, boxShadow: accent === 'cyan' ? 'var(--glow-cyan)' : 'var(--glow-magenta)' }} />
    </div>
  );
}
