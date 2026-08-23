import * as React from 'react';

/**
 * Framed art tile for ordnance, vehicles and structures.
 *
 * ART PENDING: no per-sprite pixel-art files shipped with the brand material —
 * only three large composite concept sheets (assets/concept/). Until sprite PNGs
 * exist, the tile renders a tier-framed placeholder carrying the sprite's initials.
 * Pass `src` to show real art; never substitute a hand-drawn SVG.
 */
export interface IconTileProps {
  /** sprite key from SPRITE_KEYS, e.g. "void-bomb", "clockwork-tank" */
  sprite: string;
  /** path to real pixel-art once supplied, e.g. "assets/sprites/void-bomb.png" */
  src?: string;
  /** tile height in px */
  size?: number;
  /** frame colour follows the T1–T4 ladder */
  tier?: 1 | 2 | 3 | 4;
  framed?: boolean;
  glow?: 'magenta' | 'cyan' | 'violet';
  label?: string;
  /** cover = square tile; contain = 1.45:1 tile for wide vehicle art */
  fit?: 'cover' | 'contain';
  style?: React.CSSProperties;
}
export declare function IconTile(props: IconTileProps): JSX.Element;
/** Agreed sprite names, grouped: vehicles, ordnance, weapons, defenses, structures, meta. */
export declare const SPRITES: Record<string, string[]>;
export declare const SPRITE_KEYS: string[];
