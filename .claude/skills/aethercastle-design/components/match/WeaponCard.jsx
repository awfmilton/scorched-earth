import React from 'react';
import { IconTile } from '../core/IconTile.jsx';
import { Badge } from '../core/Badge.jsx';
import { Button } from '../core/Button.jsx';

/** Armory catalogue card: sprite, tier, ballistic stats, price, buy action. */
export function WeaponCard({ name, sprite, tier = 1, family, cost = 0, packSize = 1, owned = 0, blast, damage, description, affordable = true, onBuy, selected, style }) {
  const [hover, setHover] = React.useState(false);
  const edge = `var(--tier-${tier})`;
  return (
    <article
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{
        display: 'flex', flexDirection: 'column', gap: 'var(--space-5)', padding: 'var(--gutter-panel)',
        background: 'var(--plate)', backgroundImage: 'var(--scanline), var(--plate)',
        border: `var(--border-plate) solid ${selected || hover ? edge : 'var(--stone-600)'}`,
        borderRadius: 'var(--radius-plate)', width: 268,
        boxShadow: selected || hover ? `var(--bevel-raised), 0 0 14px -2px ${edge}` : 'var(--bevel-raised), var(--shadow-panel)',
        transition: 'var(--transition-control)', ...style
      }}>
      <header style={{ display: 'flex', gap: 'var(--space-5)', alignItems: 'flex-start' }}>
        <IconTile sprite={sprite} size={52} tier={tier} glow={tier >= 3 ? (tier === 4 ? 'violet' : 'magenta') : undefined} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <h3 style={{ margin: 0, font: 'var(--type-section)', color: 'var(--parchment-100)', lineHeight: 1.15, minHeight: '2.3em' }}>{name}</h3>
          <div style={{ display: 'flex', gap: 'var(--space-3)', marginTop: 'var(--space-3)' }}>
            <Badge tier={tier}>{family}</Badge>
            {(owned === Infinity || owned > 0) && <Badge tone="stone">Held ×{owned === Infinity ? '∞' : owned}</Badge>}
          </div>
        </div>
      </header>
      {description && <p style={{ margin: 0, font: 'var(--type-body-sm)', color: 'var(--text-on-plate-muted)', textWrap: 'pretty' }}>{description}</p>}
      <dl style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 'var(--space-4)', margin: 0, paddingTop: 'var(--space-4)', borderTop: 'var(--border-etch-line)' }}>
        {[['Blast', blast], ['Damage', damage], ['Pack', `×${packSize}`]].map(([k, v]) => (
          <div key={k}>
            <dt className="ac-label" style={{ color: 'var(--brass-400)' }}>{k}</dt>
            <dd className="ac-readout" style={{ margin: 0, color: 'var(--cyan-400)', fontSize: 'var(--text-sm)' }}>{v === undefined || v === null ? '—' : v}</dd>
          </div>
        ))}
      </dl>
      <footer style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-5)' }}>
        <span className="ac-readout" style={{ color: affordable ? 'var(--cash)' : 'var(--blood-500)', fontSize: 'var(--text-md)' }}>${cost.toLocaleString()}</span>
        <Button size="sm" variant={affordable ? 'gild' : 'plate'} disabled={!affordable} onClick={onBuy} style={affordable ? null : { opacity: .75 }}>{affordable ? 'Forge' : 'Short'}</Button>
      </footer>
    </article>
  );
}

/** Dense catalogue row — the armory's list mode, sits flush inside a parchment sheet. */
export function ShopRow({ name, sprite, tier = 1, cost = 0, packSize = 1, owned = 0, affordable = true, onBuy, style }) {
  const [hover, setHover] = React.useState(false);
  return (
    <div onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} style={{
      display: 'grid', gridTemplateColumns: '2.2fr .8fr .7fr .7fr auto', alignItems: 'center', gap: 'var(--space-6)',
      minHeight: 'var(--row-height)', padding: '0 var(--space-6)',
      background: hover ? 'rgba(43,33,21,.10)' : 'transparent',
      borderBottom: 'var(--border-ink-rule)', ...style
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-5)', minWidth: 0 }}>
        <IconTile sprite={sprite} size={28} tier={tier} />
        <span style={{ font: 'var(--type-body)', fontWeight: 600, color: 'var(--text-on-parchment)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</span>
      </div>
      <span className="ac-readout" style={{ color: affordable ? '#5C4A12' : 'var(--blood-600)', fontSize: 'var(--text-sm)' }}>${cost.toLocaleString()}</span>
      <span className="ac-readout" style={{ color: 'var(--text-on-parchment-muted)', fontSize: 'var(--text-sm)' }}>×{packSize}</span>
      <span className="ac-readout" style={{ color: 'var(--text-on-parchment)', fontSize: 'var(--text-sm)' }}>{owned === Infinity ? '∞' : owned}</span>
      <Button size="sm" variant={affordable ? 'gild' : 'plate'} disabled={!affordable} onClick={onBuy}
        style={affordable ? null : { background: 'transparent', color: 'var(--text-on-parchment-muted)', borderColor: 'var(--border-rule-ink)', boxShadow: 'none', opacity: 1 }}>Buy</Button>
    </div>
  );
}
