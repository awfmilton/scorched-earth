import * as React from 'react';

/** Square-tick radio row — used for weapon availability, turn order, wall type. */
export interface RadioGroupProps {
  label?: string;
  name: string;
  options?: Array<string | { value: string; label: string }>;
  value?: string;
  onChange?: (value: string) => void;
  /** lay options in a row (default) or stack them */
  inline?: boolean;
  style?: React.CSSProperties;
}
export declare function RadioGroup(props: RadioGroupProps): JSX.Element;

/** Ratcheting brass toggle for boolean rules (friendly fire, sudden death, screen shake). */
export interface SwitchProps {
  label?: string;
  checked?: boolean;
  onChange?: (next: boolean) => void;
  style?: React.CSSProperties;
}
export declare function Switch(props: SwitchProps): JSX.Element;
