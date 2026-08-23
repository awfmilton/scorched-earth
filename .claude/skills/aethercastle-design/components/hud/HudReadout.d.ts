import * as React from 'react';

/** Label-over-value HUD cell — the atom of the battle strip (angle, power, cash, net state). */
export interface HudReadoutProps {
  label: string;
  value: React.ReactNode;
  /** trailing unit, dimmed (°, HP, $) */
  unit?: string;
  tone?: 'cyan' | 'magenta' | 'brass' | 'acid' | 'blood';
  size?: 'sm' | 'md' | 'lg';
  /** add the aether text-glow — reserve for the value the player is currently changing */
  emphasis?: boolean;
  style?: React.CSSProperties;
}
export declare function HudReadout(props: HudReadoutProps): JSX.Element;

/** Hull integrity, with optional shield charge riding underneath. */
export interface HpBarProps {
  hp?: number;
  max?: number;
  shield?: number;
  /** >0 renders the cyan shield strip */
  shieldMax?: number;
  width?: number;
  /** 6px bar, no label row — for lobby slots and kill feed */
  compact?: boolean;
  label?: string;
  style?: React.CSSProperties;
}
export declare function HpBar(props: HpBarProps): JSX.Element;

/** Wind readout: centre-zero bar, cyan needle growing left or right. */
export interface WindGaugeProps {
  /** signed wind; negative blows left */
  value?: number;
  maxValue?: number;
  width?: number;
  style?: React.CSSProperties;
}
export declare function WindGauge(props: WindGaugeProps): JSX.Element;
