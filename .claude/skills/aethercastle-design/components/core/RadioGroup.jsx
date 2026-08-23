import React from 'react';

export function RadioGroup({ label, name, options = [], value, onChange, inline = true, style }) {
  return (
    <fieldset style={{ border: 0, margin: 0, padding: 0, ...style }}>
      {label && <legend className="ac-label" style={{ color: 'var(--brass-300)', padding: 0, marginBottom: 'var(--space-4)' }}>{label}</legend>}
      <div style={{ display: 'flex', flexDirection: inline ? 'row' : 'column', gap: 'var(--space-6)', flexWrap: 'wrap' }}>
        {options.map(o => {
          const opt = typeof o === 'string' ? { value: o, label: o } : o;
          const on = value === opt.value;
          return (
            <label key={opt.value} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)', cursor: 'pointer', font: 'var(--type-body-sm)', color: on ? 'var(--parchment-100)' : 'var(--stone-300)' }}>
              <input type="radio" name={name} value={opt.value} checked={on} onChange={() => onChange && onChange(opt.value)} style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }} />
              <span aria-hidden="true" style={{
                width: 16, height: 16, display: 'grid', placeItems: 'center', flex: '0 0 auto',
                background: 'var(--surface-inset)', border: `var(--border-hair) solid ${on ? 'var(--cyan-500)' : 'var(--border-brass-dim)'}`,
                boxShadow: on ? 'var(--glow-cyan)' : 'var(--bevel-inset)', transition: 'var(--transition-control)'
              }}>
                <span style={{ width: 8, height: 8, background: on ? 'var(--cyan-500)' : 'transparent' }} />
              </span>
              {opt.label}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

export function Switch({ label, checked, onChange, style }) {
  return (
    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-5)', cursor: 'pointer', font: 'var(--type-body-sm)', color: 'var(--text-on-plate)', ...style }}>
      <span role="switch" aria-checked={!!checked} onClick={() => onChange && onChange(!checked)} style={{
        width: 44, height: 22, flex: '0 0 auto', position: 'relative', background: 'var(--surface-inset)',
        border: `var(--border-hair) solid ${checked ? 'var(--magenta-500)' : 'var(--border-brass-dim)'}`,
        boxShadow: checked ? 'var(--glow-magenta)' : 'var(--bevel-inset)', transition: 'var(--transition-control)'
      }}>
        <span style={{
          position: 'absolute', top: 2, left: checked ? 23 : 2, width: 17, height: 16,
          background: checked ? 'var(--brass-rail)' : 'var(--plate)',
          borderLeft: '1px solid var(--brass-300)', borderRight: '1px solid var(--brass-700)',
          transition: `left var(--dur-fast) var(--ease-ratchet)`
        }} />
      </span>
      {label}
    </label>
  );
}
