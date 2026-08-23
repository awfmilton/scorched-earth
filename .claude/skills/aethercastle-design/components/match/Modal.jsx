import React from 'react';

/** Scrimmed modal over the battlefield: shop, settings, standings, forfeit confirm. */
export function Modal({ open = true, title, kicker, surface = 'plate', width = 'var(--width-sheet)', onClose, footer, children, style }) {
  if (!open) return null;
  const parchment = surface === 'parchment';
  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 'var(--z-modal)', display: 'grid', placeItems: 'center',
      background: 'var(--surface-scrim)', backdropFilter: 'var(--blur-glass)', padding: 'var(--gutter-screen)'
    }}>
      <div role="dialog" aria-modal="true" style={{
        width, maxWidth: '100%', maxHeight: '100%', display: 'flex', flexDirection: 'column',
        background: parchment ? 'var(--parchment)' : 'var(--plate)',
        color: parchment ? 'var(--text-on-parchment)' : 'var(--text-on-plate)',
        border: 'var(--border-brass-double)', borderRadius: parchment ? 'var(--radius-sheet)' : 'var(--radius-plate)',
        boxShadow: 'var(--shadow-modal)', overflow: 'hidden', ...style
      }}>
        <header style={{
          display: 'flex', alignItems: 'center', gap: 'var(--space-6)',
          padding: 'var(--space-6) var(--gutter-parchment)',
          background: parchment ? 'transparent' : 'var(--banner-fill)',
          borderBottom: `var(--border-plate) solid ${parchment ? 'var(--border-rule-ink)' : 'var(--brass-600)'}`
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            {kicker && <div className="ac-label" style={{ color: parchment ? 'var(--text-on-parchment-muted)' : 'var(--brass-400)' }}>{kicker}</div>}
            <h2 style={{ margin: 0, font: 'var(--type-title)', fontSize: 'var(--text-xl)', color: parchment ? 'var(--text-on-parchment)' : 'var(--parchment-100)' }}>{title}</h2>
          </div>
          {onClose && (
            <button onClick={onClose} aria-label="Close" style={{
              width: 30, height: 30, background: 'transparent', color: parchment ? 'var(--text-on-parchment-muted)' : 'var(--brass-300)',
              border: `var(--border-hair) solid ${parchment ? 'var(--border-rule-ink)' : 'var(--brass-700)'}`, cursor: 'pointer', font: 'var(--type-readout)'
            }}>✕</button>
          )}
        </header>
        <div style={{ padding: parchment ? 'var(--gutter-parchment)' : 'var(--gutter-panel)', overflow: 'auto', flex: 1 }}>{children}</div>
        {footer && <footer style={{
          display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 'var(--space-5)',
          padding: 'var(--space-6) var(--gutter-parchment)',
          borderTop: `var(--border-plate) solid ${parchment ? 'var(--border-rule-ink)' : 'var(--brass-600)'}`
        }}>{footer}</footer>}
      </div>
    </div>
  );
}
