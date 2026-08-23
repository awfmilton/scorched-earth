import * as React from 'react';

/** Armory catalogue card — the showcase form of a purchasable, with ballistic stats. */
export interface WeaponCardProps {
  name: string;
  /** IconTile sprite key */
  sprite: string;
  tier?: 1 | 2 | 3 | 4;
  /** behavioural family: "Direct", "Sub-munition", "Rolling", "Beam", "Terraform", "Support" */
  family?: string;
  cost?: number;
  packSize?: number;
  owned?: number;
  blast?: number | string;
  damage?: number | string;
  /** one sentence, lore-flavoured */
  description?: string;
  /** false dims price to blood red and disables the action */
  affordable?: boolean;
  onBuy?: () => void;
  selected?: boolean;
  style?: React.CSSProperties;
}
export declare function WeaponCard(props: WeaponCardProps): JSX.Element;

/** Dense list row of the same purchasable — for parchment shop sheets. `owned` accepts Infinity. */
export interface ShopRowProps {
  name: string;
  sprite: string;
  tier?: 1 | 2 | 3 | 4;
  cost?: number;
  packSize?: number;
  owned?: number;
  affordable?: boolean;
  onBuy?: () => void;
  style?: React.CSSProperties;
}
export declare function ShopRow(props: ShopRowProps): JSX.Element;
