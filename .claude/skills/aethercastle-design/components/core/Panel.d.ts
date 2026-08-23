import * as React from 'react';

/**
 * The system's only container. Plate = riveted steel chrome; parchment = anything the player reads at length.
 * @startingPoint section="Core" subtitle="Plate panel and parchment sheet containers" viewport="700x260"
 */
export interface PanelProps {
  title?: string;
  /** small brass eyebrow above the title */
  kicker?: string;
  /** right-aligned header controls */
  actions?: React.ReactNode;
  surface?: 'plate' | 'parchment';
  /** frame + header rule colour on plate panels */
  accent?: 'brass' | 'magenta' | 'cyan' | 'violet';
  /** set false for flush content (tables, lists) */
  pad?: boolean;
  children?: React.ReactNode;
  style?: React.CSSProperties;
}
export declare function Panel(props: PanelProps): JSX.Element;

/** Gilded nameplate between blocks, with aether rails running out to both edges. */
export interface SectionBannerProps {
  children?: React.ReactNode;
  accent?: 'magenta' | 'cyan' | 'brass';
  style?: React.CSSProperties;
}
export declare function SectionBanner(props: SectionBannerProps): JSX.Element;
