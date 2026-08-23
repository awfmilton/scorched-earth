import React from 'react';

export function IconButton({ label, glyph, variant = 'plate', size = 32, active, style, ...rest }) {
  const [hover, setHover] = React.useState(false);
  const tone = variant === 'primary' ? 'var(--magenta-500)' : variant === 'secondary' ? 'var(--cyan-500)' : 'var(--brass-400)';
  return (
    <button
      aria-label={label} title={label}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{
        width: size, height: size, display: 'grid', placeItems: 'center',
        background: active ? 'var(--void-800)' : 'var(--plate)', color: active || hover ? tone : 'var(--stone-300)',
        border: `var(--border-hair) solid ${active || hover ? tone : 'var(--border-brass-dim)'}`,
        borderRadius: 'var(--radius-plate)', cursor: 'pointer', padding: 0,
        boxShadow: active ? 'var(--bevel-inset)' : 'var(--bevel-raised)',
        transition: 'var(--transition-control)', ...style
      }}
      {...rest}
    >{glyph}</button>
  );
}
