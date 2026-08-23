import * as React from 'react';
import type { SelectableWeapon } from './WeaponSelector';

export interface HudPlayer {
  name: string;
  /** identity colour, var(--player-N) */
  color?: string;
  hp?: number;
  shield?: number;
  shieldMax?: number;
  angle?: number;
  power?: number;
  cash?: number;
}

/** The whole battle HUD strip, composed from HudReadout / HpBar / WindGauge / WeaponSelector. */
export interface HudStripProps {
  player?: HudPlayer;
  weapons?: SelectableWeapon[];
  weaponIndex?: number;
  onCycle?: (nextIndex: number) => void;
  /** signed wind value */
  wind?: number;
  /** omit for local matches */
  netState?: 'live' | 'connecting' | 'reconnecting' | 'lost';
  /** key legend text, right-aligned and dimmed */
  legend?: string;
  style?: React.CSSProperties;
}
export declare function HudStrip(props: HudStripProps): JSX.Element;
