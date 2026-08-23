import * as React from 'react';

/** Turn handoff / phase banner across the top of the battlefield. */
export interface TurnBannerProps {
  player?: string;
  /** that player's identity colour (var(--player-N)) */
  color?: string;
  /** e.g. "Poolshark AI · shot 2" */
  subtitle?: string;
  /** seconds remaining; turns blood-red at 5 */
  timer?: number;
  phase?: 'turn' | 'intermission' | 'round' | 'standings';
  style?: React.CSSProperties;
}
export declare function TurnBanner(props: TurnBannerProps): JSX.Element;

/** One line of the kill feed / event log. */
export interface KillFeedToastProps {
  actor?: string;
  actorColor?: string;
  /** "obliterated", "buried", "shielded", "salvaged" — past tense, lower case */
  verb?: string;
  target?: string;
  targetColor?: string;
  /** ordnance name, shown as a brass label */
  weapon?: string;
  /** HP lost, rendered as −N */
  damage?: number;
  tone?: 'damage' | 'heal' | 'info';
  style?: React.CSSProperties;
}
export declare function KillFeedToast(props: KillFeedToastProps): JSX.Element;
