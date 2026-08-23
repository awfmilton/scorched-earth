import React from 'react';

const field = (focus, invalid, mono) => ({
  height: 'var(--control-height)', width: '100%', padding: '0 var(--space-5)',
  background: 'var(--surface-inset)', color: mono ? 'var(--text-numeric)' : 'var(--text-on-plate)',
  font: mono ? 'var(--type-readout)' : 'var(--type-body-sm)',
  border: `var(--border-hair) solid ${invalid ? 'var(--blood-500)' : focus ? 'var(--cyan-500)' : 'var(--border-brass-dim)'}`,
  borderRadius: 'var(--radius-plate)',
  boxShadow: focus ? 'var(--bevel-inset), var(--glow-cyan)' : 'var(--bevel-inset)',
  outline: 'none', transition: 'var(--transition-control)'
});

export function Input({ label, hint, invalid, mono, code, style, ...rest }) {
  const [focus, setFocus] = React.useState(false);
  return (
    <label style={{ display: 'block', ...style }}>
      {label && <span className="ac-label" style={{ display: 'block', color: 'var(--brass-300)', marginBottom: 'var(--space-3)' }}>{label}</span>}
      <input
        onFocus={() => setFocus(true)} onBlur={() => setFocus(false)}
        style={{
          ...field(focus, invalid, mono || code),
          ...(code ? { textAlign: 'center', textTransform: 'uppercase', letterSpacing: '.5em', fontSize: 'var(--text-md)' } : null)
        }}
        {...rest}
      />
      {hint && <span style={{ display: 'block', font: 'var(--type-body-sm)', color: invalid ? 'var(--blood-500)' : 'var(--text-on-plate-muted)', marginTop: 'var(--space-3)' }}>{hint}</span>}
    </label>
  );
}

export function Select({ label, options = [], style, ...rest }) {
  const [focus, setFocus] = React.useState(false);
  return (
    <label style={{ display: 'block', ...style }}>
      {label && <span className="ac-label" style={{ display: 'block', color: 'var(--brass-300)', marginBottom: 'var(--space-3)' }}>{label}</span>}
      <div style={{ position: 'relative' }}>
        <select onFocus={() => setFocus(true)} onBlur={() => setFocus(false)}
          style={{ ...field(focus, false, false), appearance: 'none', paddingRight: 'var(--space-9)', cursor: 'pointer' }} {...rest}>
          {options.map(o => typeof o === 'string'
            ? <option key={o} value={o}>{o}</option>
            : <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <span aria-hidden="true" style={{ position: 'absolute', right: 'var(--space-5)', top: '50%', transform: 'translateY(-50%)', color: 'var(--brass-400)', font: 'var(--type-readout-sm)', pointerEvents: 'none' }}>▼</span>
      </div>
    </label>
  );
}
