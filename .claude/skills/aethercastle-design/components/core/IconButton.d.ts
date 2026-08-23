import * as React from 'react';

/** Square 32px chrome button for HUD/toolbar affordances (mute, settings, close, weapon cycle). */
export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** accessible name — required, the button has no text */
  label: string;
  /** the glyph node (Lucide <i data-lucide> element, sprite, or character) */
  glyph?: React.ReactNode;
  variant?: 'plate' | 'primary' | 'secondary';
  /** edge length in px, default 32 */
  size?: number;
  /** pressed/toggled state — sinks the plate and tints the glyph */
  active?: boolean;
}
export declare function IconButton(props: IconButtonProps): JSX.Element;
