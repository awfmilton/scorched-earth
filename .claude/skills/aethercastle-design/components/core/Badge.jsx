import React from 'react';

const TONE = {
  brass: ['var(--brass-500)', 'var(--brass-200)'],
  magenta: ['var(--magenta-600)', 'var(--magenta-400)'],
  cyan: ['var(--cyan-600)', 'var(--cyan-400)'],
  violet: ['var(--violet-600)', 'var(--violet-500)'],
  acid: ['var(--acid-500)', 'var(--acid-400)'],
  blood: ['var(--blood-600)', 'var(--blood-500)'],
  stone: ['var(--stone-500)', 'var(--stone-300)']
};
const TIER_TONE = { 1: 'brass', 2: 'cyan', 3: 'magenta', 4: 'violet' };

export function Badge({ tone = 'brass', tier, solid, pill, children, style }) {
  const key = tier ? TIER_TONE[tier] : tone;
  const [edge, text] = TONE[key] || TONE.brass;
  return (
    <span className="ac-label" style={{
      display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)',
      padding: '3px var(--space-4)', background: solid ? edge : 'rgba(8,7,10,.55)',
      color: solid ? 'var(--void-900)' : text, border: `var(--border-hair) solid ${edge}`,
      borderRadius: pill ? 'var(--radius-pill)' : 'var(--radius-plate)', whiteSpace: 'nowrap', ...style
    }}>{tier ? `T${tier} ` : null}{children}</span>
  );
}

/** The shareable 4-letter room code, presented as a gilded chip. */
export function ShareCodeChip({ code = 'ABCD', onCopy, label = 'Share code', style }) {
  const [copied, setCopied] = React.useState(false);
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 'var(--space-6)',
      padding: 'var(--space-4) var(--space-6)', background: 'var(--surface-inset)',
      border: 'var(--border-brass-double)', borderRadius: 'var(--radius-plate)',
      boxShadow: 'var(--bevel-inset)', ...style
    }}>
      <span className="ac-label" style={{ color: 'var(--brass-400)' }}>{label}</span>
      <strong style={{ font: 'var(--type-readout-lg)', letterSpacing: '.32em', color: 'var(--cyan-400)', textShadow: 'var(--glow-text-cyan)' }}>{code}</strong>
      <button onClick={() => { setCopied(true); onCopy && onCopy(code); }} className="ac-label" style={{
        background: 'transparent', border: `var(--border-hair) solid var(--brass-700)`, color: copied ? 'var(--acid-400)' : 'var(--brass-300)',
        padding: '4px var(--space-4)', cursor: 'pointer', borderRadius: 'var(--radius-plate)', transition: 'var(--transition-control)'
      }}>{copied ? 'Copied' : 'Copy'}</button>
    </div>
  );
}
