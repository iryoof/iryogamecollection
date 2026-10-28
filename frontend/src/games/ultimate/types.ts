// Gegenstueck zu backend/src/game/UltimateLobby.ts. Bewusst von Hand
// gespiegelt statt aus shared/ importiert: shared/types.ts haelt heute nur
// Cypher- und VoteKick-Typen, und Wavelength spiegelt seine Typen ebenso.

export type Mark = 'X' | 'O'
export type Cell = Mark | null
export type Outcome = Mark | 'draw' | null
export type MatchMode = '1v1' | '2v2'
export type UltimatePhase = 'waiting' | 'playing' | 'finished'
export type UltimateScreen = 'menu' | 'table'

export interface SubBoard {
  cells: Cell[]
  result: Outcome
}

export interface UltimateBoard {
  subs: SubBoard[]
  forcedSub: number | null
  result: Outcome
}

export interface Move {
  sub: number
  cell: number
}

export interface Score {
  X: number
  O: number
}

export interface PendingMove {
  board: number
  team: Mark
  seat: number
}

/** Ohne reconnectKey — den schickt der Server nur an den Spieler selbst. */
export interface UltimatePlayer {
  id: string
  name: string
  isHost: boolean
  isDisconnected: boolean
  reconnectDeadline: number | null
  seat: number | null
}

export interface UltimateMatchView {
  boards: UltimateBoard[]
  round: number
  score: Score
  finished: boolean
  winner: Mark | 'draw' | null
  pending: PendingMove[]
  legal: Move[][]
}

export interface UltimateState {
  code: string
  phase: UltimatePhase
  mode: MatchMode
  hostId: string
  players: UltimatePlayer[]
  seats: (string | null)[]
  match: UltimateMatchView | null
}

export interface UltimateSession {
  playerId: string
  reconnectKey: string
  lobbyCode: string
  playerName: string
  reconnectDeadline: number | null
}

export interface UltimateAck {
  ok?: boolean
  code?: string
  error?: string
  session?: UltimateSession
}

export const SEAT_LABELS = ['A', 'B', 'C', 'D']

export function seatCountOf(mode: MatchMode): number {
  return mode === '2v2' ? 4 : 2
}

/** Platz 0 und 1 sind Team X, Platz 2 und 3 Team O. Im 1v1 nur 0 und 1. */
export function teamOfSeat(mode: MatchMode, seat: number): Mark {
  if (mode === '2v2') return seat <= 1 ? 'X' : 'O'
  return seat === 0 ? 'X' : 'O'
}

export function boardName(mode: MatchMode, index: number): string {
  if (mode === '1v1') return 'Das Gitter'
  return index === 0 ? 'Gitter links' : 'Gitter rechts'
}
