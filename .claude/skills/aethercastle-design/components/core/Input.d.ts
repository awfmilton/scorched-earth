import * as React from 'react';

/** Recessed field on plate. `code` renders the 4-letter share-code entry style. */
export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  invalid?: boolean;
  /** numerals: mono face, cyan readout colour */
  mono?: boolean;
  /** share-code entry: centred, upper-cased, wide letterspacing */
  code?: boolean;
}
export declare function Input(props: InputProps): JSX.Element;

/** Matching select with a brass chevron. */
export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  options?: Array<string | { value: string; label: string }>;
}
export declare function Select(props: SelectProps): JSX.Element;
