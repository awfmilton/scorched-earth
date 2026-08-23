import React from 'react';

/* SPRITE MANIFEST.
   The brand's art is pixel-art. The three concept sheets in assets/concept/ are
   the reference, but they are single 7MB composites — not runtime sprites — so
   IconTile renders a framed PLACEHOLDER until real per-sprite PNGs are supplied.
   Pass `src` once art exists (e.g. src="assets/sprites/void-bomb.png").
   Keys below are the agreed sprite names, grouped as they appear on the sheets. */
export const SPRITES = {
  vehicles: ['clockwork-tank', 'walker-mech', 'airship-platform', 'brass-plated-tank', 'aether-field-tank', 'scout-drone', 'drone-bay', 'submersible', 'hover-skiff', 'siege-platform'],
  ordnance: ['steam-mortar', 'lightning-lance', 'clockwork-harpoon', 'aether-strike-missile', 'sonic-disruptor', 'void-bomb', 'acid-rounds', 'void-balls', 'tesla-cores', 'phosphorus-shell', 'aether-nuke', 'dirt-clod'],
  weapons: ['acid-sprayer', 'phosphorus-cannon', 'tesla-coil-cannon', 'void-rift-projector', 'pike-ram', 'net-gun'],
  defenses: ['oil-vats', 'portcullis', 'scorpion-crossbow', 'shield-dome', 'aether-radar', 'repair-bay', 'missile-silo'],
  structures: ['norman-castle', 'keep-gatehouse', 'aether-forge'],
  meta: ['siege-loot', 'guild-expedition', 'fusion-bottle', 'aetherium-shard', 'clockwork-gears', 'powdered-sapphire']
};
export const SPRITE_KEYS = Object.values(SPRITES).flat();

function abbrev(key = '') {
  const parts = String(key).split('-').filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 3).toUpperCase();
  return parts.slice(0, 3).map(p => p[0]).join('').toUpperCase();
}

export function IconTile({ sprite, src, size = 48, tier, framed = true, glow, label, fit = 'cover', style }) {
  const edge = tier ? `var(--tier-${tier})` : 'var(--brass-600)';
  const glowShadow = glow === 'magenta' ? 'var(--glow-magenta)' : glow === 'cyan' ? 'var(--glow-cyan)' : glow === 'violet' ? 'var(--glow-violet)' : 'none';
  const w = fit === 'contain' ? Math.round(size * 1.45) : size;
  return (
    <span role="img" aria-label={label || sprite} title={label || sprite}
      data-sprite={sprite}
      style={{
        position: 'relative', display: 'inline-grid', placeItems: 'center', width: w, height: size,
        flex: '0 0 auto', overflow: 'hidden', background: 'var(--void-800)',
        backgroundImage: src ? 'none' : 'var(--scanline)',
        border: framed ? `var(--border-hair) solid ${edge}` : 'none',
        borderRadius: 'var(--radius-icon)', boxShadow: glowShadow, ...style
      }}>
      {src
        ? <img src={src} alt="" style={{ width: '100%', height: '100%', objectFit: fit === 'contain' ? 'contain' : 'cover', imageRendering: 'pixelated' }} />
        : <span aria-hidden="true" className="ac-readout" style={{
            fontSize: Math.max(9, Math.round(size * 0.28)), color: tier ? edge : 'var(--brass-400)',
            letterSpacing: '.06em', opacity: .9
          }}>{abbrev(sprite)}</span>}
    </span>
  );
}
