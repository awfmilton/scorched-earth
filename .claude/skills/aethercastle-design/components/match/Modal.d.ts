import * as React from 'react';

/** Scrimmed dialog over the battlefield — armory, settings, standings, forfeit confirm. */
export interface ModalProps {
  open?: boolean;
  title?: string;
  kicker?: string;
  /** parchment for anything read at length (armory, rules); plate for chrome */
  surface?: 'plate' | 'parchment';
  /** CSS width, defaults to var(--width-sheet) = 720px */
  width?: string | number;
  onClose?: () => void;
  /** right-aligned action bar */
  footer?: React.ReactNode;
  children?: React.ReactNode;
  style?: React.CSSProperties;
}
export declare function Modal(props: ModalProps): JSX.Element;
