import * as React from 'react';

/**
 * Primary action control. Riveted brass-edged plate; never rounded past 2px.
 * @startingPoint section="Core" subtitle="Riveted action buttons in every variant" viewport="700x180"
 */
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** primary = aether magenta, secondary = cyan telemetry, gild = brass/currency, plate = neutral, ghost = low emphasis, danger = destructive */
  variant?: 'primary' | 'secondary' | 'gild' | 'plate' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  /** stretch to container width — used for CREATE MATCH / START GAME */
  block?: boolean;
  disabled?: boolean;
  /** leading glyph or <IconTile> */
  icon?: React.ReactNode;
  children?: React.ReactNode;
}
export declare function Button(props: ButtonProps): JSX.Element;
