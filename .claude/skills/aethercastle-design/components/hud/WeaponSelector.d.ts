import * as React from 'react';

export interface SelectableWeapon {
  name: string;
  /** IconTile sprite key */
  sprite: string;
  /** Infinity renders ∞ (Baby Missile / Steam Mortar) */
  ammo: number;
  tier?: 1 | 2 | 3 | 4;
}

/** In-battle ordnance carousel bound to the [ / ] / Tab cycle keys. */
export interface WeaponSelectorProps {
  weapons?: SelectableWeapon[];
  index?: number;
  onCycle?: (nextIndex: number) => void;
  style?: React.CSSProperties;
}
export declare function WeaponSelector(props: WeaponSelectorProps): JSX.Element;
