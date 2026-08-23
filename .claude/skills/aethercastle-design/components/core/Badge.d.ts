import * as React from 'react';

/** Small status/tier marker. Pass `tier` to inherit the T1–T4 colour ladder automatically. */
export interface BadgeProps {
  tone?: 'brass' | 'magenta' | 'cyan' | 'violet' | 'acid' | 'blood' | 'stone';
  /** weapon/cosmetic tier 1–4; overrides `tone` and prefixes "T{n}" */
  tier?: 1 | 2 | 3 | 4;
  /** filled instead of outlined */
  solid?: boolean;
  pill?: boolean;
  children?: React.ReactNode;
  style?: React.CSSProperties;
}
export declare function Badge(props: BadgeProps): JSX.Element;

/** Gilded chip holding the 4-letter room code, with a copy affordance. */
export interface ShareCodeChipProps {
  code?: string;
  onCopy?: (code: string) => void;
  label?: string;
  style?: React.CSSProperties;
}
export declare function ShareCodeChip(props: ShareCodeChipProps): JSX.Element;
