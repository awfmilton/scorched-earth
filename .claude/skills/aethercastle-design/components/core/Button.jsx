import React from 'react';

const KIND = {
  primary: { bg: 'linear-gradient(180deg,var(--magenta-500) 0%,var(--magenta-600) 55%,var(--magenta-700) 100%)', fg: 'var(--parchment-100)', edge: 'var(--magenta-500)', glow: 'var(--glow-magenta)' },
  secondary: { bg: 'linear-gradient(180deg,var(--cyan-500) 0%,var(--cyan-600) 55%,var(--cyan-700) 100%)', fg: 'var(--void-900)', edge: 'var(--cyan-400)', glow: 'var(--glow-cyan)' },
  gild: { bg: 'var(--brass-rail)', fg: 'var(--void-900)', edge: 'var(--brass-300)', glow: 'var(--glow-brass)' },
  plate: { bg: 'var(--plate)', fg: 'var(--text-on-plate)', edge: 'var(--brass-500)', glow: 'none' },
  ghost: { bg: 'transparent', fg: 'var(--brass-300)', edge: 'var(--brass-700)', glow: 'none' },
  danger: { bg: 'linear-gradient(180deg,var(--blood-500) 0%,var(--blood-600) 100%)', fg: 'var(--parchment-100)', edge: 'var(--blood-500)', glow: 'none' }
};
const SIZE = {
  sm: { h: 'var(--control-height-sm)', px: 'var(--space-5)', fs: 'var(--text-2xs)' },
  md: { h: 'var(--control-height)', px: 'var(--space-7)', fs: 'var(--text-xs)' },
  lg: { h: 'var(--control-height-lg)', px: 'var(--space-9)', fs: 'var(--text-sm)' }
};

export function Button({ variant = 'primary', size = 'md', block, disabled, icon, children, style, ...rest }) {
  const k = KIND[variant] || KIND.primary;
  const s = SIZE[size] || SIZE.md;
  const [hover, setHover] = React.useState(false);
  const [down, setDown] = React.useState(false);
  return (
    <button
      disabled={disabled}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => { setHover(false); setDown(false); }}
      onMouseDown={() => setDown(true)}
      onMouseUp={() => setDown(false)}
      style={{
        display: block ? 'flex' : 'inline-flex', width: block ? '100%' : 'auto',
        alignItems: 'center', justifyContent: 'center', gap: 'var(--space-4)',
        height: s.h, padding: `0 ${s.px}`, fontSize: s.fs,
        fontFamily: 'var(--font-heading)', fontWeight: 900, letterSpacing: 'var(--tracking-label)',
        textTransform: 'uppercase', background: k.bg, color: k.fg,
        border: `var(--border-plate) solid ${k.edge}`, borderRadius: 'var(--radius-plate)',
        boxShadow: down ? 'var(--bevel-inset)' : hover ? `var(--bevel-raised), ${k.glow}` : 'var(--bevel-raised)',
        transform: down ? 'var(--press-offset)' : 'none',
        cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.4 : 1,
        filter: hover && !disabled ? 'brightness(1.1)' : 'none',
        transition: 'var(--transition-control)', ...style
      }}
      {...rest}
    >{icon}{children}</button>
  );
}
