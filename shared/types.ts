// Game Types & Interfaces

export interface Player {
  id: string;
  nickname: string;
  isReady: boolean;
}

export interface GameSettings {
  playerCount: number;
  timerEnabled: boolean;
  timerSeconds: number; // 60-300
}

export interface GameState {
  lobbyCode: string;
  players: Player[];
  hostId: string;
  currentRound: number;
  maxRounds: number; // 0 = unlimited
  gameStarted: boolean;
  gameEnded: boolean;
  roundComplete: boolean;
  votingActive: boolean;
  submittedPlayerIds: string[];
  votedPlayerIds: string[];
  // IDs of players whose socket is currently disconnected but not yet evicted
  // from the lobby (within the 60s reconnect grace window).
  disconnectedPlayerIds: string[];
  // Map of disconnected playerId -> ms epoch of the deadline after which the
  // player will be evicted automatically. Used by the UI to render a
  // countdown.
  disconnectDeadlines: Record<string, number>;
  // Players who joined while the game was already running. They are not part
  // of the roster yet and join in at the next round.
  pendingPlayers: Player[];
  settings: GameSettings;
}

export interface TextEntry {
  lineNumber: number;
  text: string;
  author: string;
  timestamp: number;
}

export interface GameArchive {
  id: string;
  lobbyCode: string;
  date: string; // ISO timestamp
  players: string[];
  rounds: TextEntry[][];
  finalTexts: string[];
}

export interface SocketEvents {
  // Client -> Server
  'join-lobby': (code: string, nickname: string, playerId?: string) => void;
  'create-lobby': (settings: GameSettings, nickname: string, playerId?: string) => void;
  'ready-check': (playerId: string) => void;
  'submit-text': (text: string) => void;
  'submit-vote': (textIndex: number) => void;
  'skip-voting': () => void;
  'request-state': () => void;
  'leave-lobby': () => void;
  'close-lobby': () => void;
  'start-game': () => void;
  'next-round': () => void;
  'end-game': () => void;
  'play-again': () => void;
  'kick-player': (playerId: string) => void;
  'transfer-host': (newHostId: string) => void;

  // Server -> Client
  'lobby-joined': (state: GameState) => void;
  'lobby-created': (code: string, state: GameState) => void;
  'state-update': (state: GameState) => void;
  'round-started': (roundNumber: number, promptText: string) => void;
  'round-complete': (roundNumber: number) => void;
  'round-archived': (archive: GameArchive) => void;
  'voting-started': (options: string[]) => void;
  'voting-complete': (archive: GameArchive, results: number[]) => void;
  'lobby-closed': () => void;
  'game-ended': (archive: GameArchive) => void;
  'kicked': (reason: string) => void;
  'error': (message: string) => void;
}

export interface GameRound {
  roundNumber: number;
  texts: TextEntry[];
  isActive: boolean;
}

/**
 * State of an open vote kick, shared by all three multiplayer games. Null on
 * the wire means "no vote running".
 */
export interface VoteKickState {
  targetId: string;
  targetName: string;
  initiatorId: string;
  approvedBy: string[];
  rejectedBy: string[];
  /** Yes votes needed in total for the kick to go through. */
  needed: number;
  /** Connected players allowed to vote (the target is not one of them). */
  eligible: number;
  expiresAt: number;
}

export type VoteKickOutcome = 'passed' | 'failed' | 'expired' | 'cancelled';

export interface VoteKickResult {
  targetName: string;
  outcome: VoteKickOutcome;
}
