import React from 'react';
import { HudReadout, HpBar, WindGauge } from './HudReadout.jsx';
import { WeaponSelector } from './WeaponSelector.jsx';

/** The battle strip: active commander, instruments, ordnance, net state, key legend. */
export function HudStrip({ player = {}, weapons = [], weaponIndex = 0, onCycle, wind = 0, netState, legend = 'L/R Angle · U/D Power · Space Fire · [ ] Ordnance · Shift Coarse', style }) {
  const color = player.color || 'var(--player-1)';
  const net = { live: 'var(--acid-500)', connecting: 'var(--fire-500)', reconnecting: 'var(--fire-500)', lost: 'var(--blood-500)' }[netState];
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 'var(--gutter-hud)', minHeight: 'var(--hud-height)',
      padding: '0 var(--gutter-panel)', background: 'var(--plate-dark)',
      borderBottom: `var(--border-plate) solid var(--brass-600)`, boxShadow: 'var(--shadow-panel)', ...style
    }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 168 }}>
        <span className="ac-banner" style={{ color, fontSize: 'var(--text-sm)', textShadow: `0 0 8px ${color}` }}>{player.name}</span>
        <HpBar hp={player.hp} max={100} shield={player.shield} shieldMax={player.shieldMax} width={168} compact />
      </div>
      <span style={{ width: 1, alignSelf: 'stretch', background: 'var(--stone-600)' }} />
      <HudReadout label="Angle" value={player.angle} unit="°" emphasis />
      <HudReadout label="Power" value={player.power} emphasis />
      <HudReadout label="Cash" value={`$${(player.cash || 0).toLocaleString()}`} tone="brass" />
      <WindGauge value={wind} />
      <WeaponSelector weapons={weapons} index={weaponIndex} onCycle={onCycle} style={{ marginLeft: 'auto' }} />
      {netState && <HudReadout label="Net" value={netState.toUpperCase()} size="sm" tone={netState === 'live' ? 'acid' : netState === 'lost' ? 'blood' : 'brass'} style={{ minWidth: 88, color: net }} />}
      <span className="ac-label" style={{ color: 'var(--stone-400)', maxWidth: 260, lineHeight: 1.4, letterSpacing: '.08em' }}>{legend}</span>
    </div>
  );
}
