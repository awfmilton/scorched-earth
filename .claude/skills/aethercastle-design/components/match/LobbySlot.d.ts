import * as React from 'react';

/** One of the four lobby seats. `kind="empty"` renders the dashed open-seat state. */
export interface LobbySlotProps {
  index?: number;
  name?: string;
  /** identity colour var(--player-N) */
  color?: string;
  /** chassis label, e.g. "Clockwork Tank · Brass-plated" */
  chassis?: string;
  /** IconTile sprite key for the chassis */
  chassisSprite?: string;
  kind?: 'human' | 'ai' | 'empty';
  host?: boolean;
  ready?: boolean;
  /** marks the local player */
  you?: boolean;
  /** shown on empty seats as "Add AI" */
  onInvite?: () => void;
  style?: React.CSSProperties;
}
export declare function LobbySlot(props: LobbySlotProps): JSX.Element;

/** Public room browser row. */
export interface RoomListRowProps {
  host: string;
  players?: number;
  maxPlayers?: number;
  biome?: string;
  rounds?: number;
  onJoin?: () => void;
  style?: React.CSSProperties;
}
export declare function RoomListRow(props: RoomListRowProps): JSX.Element;

/** Round-end standings / global leaderboard row. Ranks 1–3 get a gilded rank plate. */
export interface StandingsRowProps {
  rank?: number;
  name?: string;
  color?: string;
  /** omit on leaderboards */
  hp?: number;
  kills?: number;
  cash?: number;
  damage?: number;
  eliminated?: boolean;
  variant?: 'standings' | 'leaderboard';
  style?: React.CSSProperties;
}
export declare function StandingsRow(props: StandingsRowProps): JSX.Element;
