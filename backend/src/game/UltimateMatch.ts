/**
 * Partie-Schicht fuer "TikTacToe Ultimate": wer sitzt wann an welchem Brett,
 * wann ist eine Runde vorbei, wie steht es.
 *
 * Die Brettregeln stehen in UltimateEngine.ts und bleiben hier unberuehrt.
 * Auch diese Datei ist seiteneffektfrei.
 *
 * Modi
 * ----
 * 1v1: ein Brett, Platz 0 spielt X, Platz 1 spielt O. Keine Rotation.
 *
 * 2v2: zwei Bretter (0 = links, 1 = rechts), vier Spieler.
 *   Team X = Platz 0 (A) und Platz 1 (B), Team O = Platz 2 (C) und Platz 3 (D).
 *   Runde 0: A und C links, B und D rechts. Pro Brett zieht erst X, dann O.
 *   Eine Runde endet erst, wenn *beide* Bretter ihr Zugpaar hatten; danach
 *   tauschen die Paare die Seite.
 *
 * Statt den Tausch als eigenen Vorgang zu fuehren, ergibt er sich aus einer
 * Formel: an Brett b sitzt in Runde r auf dem Platz eines Teams das
 * Teammitglied mit Index (r + b) % Teamgroesse. Damit ist Brett 0 in Runde 0
 * bei A, Brett 1 in Runde 0 bei B, in Runde 1 genau umgekehrt — und im 1v1
 * faellt die Rotation von allein weg, weil ein Team dort nur ein Mitglied hat.
 *
 * Nebenwirkung, die wir ausdruecklich wollen: ist ein Brett fertig, laeuft die
 * Rotation am verbliebenen Brett unveraendert weiter. Alle vier spielen dort
 * zu Ende, niemand sitzt untaetig daneben.
 */

import {
  UltimateBoard,
  Mark,
  Move,
  Score,
  MoveError,
  createBoard,
  applyMove,
  isBoardFinished,
  legalMoves,
  scoreBoard,
  addScores
} from './UltimateEngine'

export type MatchMode = '1v1' | '2v2'

/** Team-Kennung. Faellt absichtlich mit dem gespielten Zeichen zusammen. */
export type TeamId = Mark

export interface RoundProgress {
  X: boolean
  O: boolean
}

export interface MatchState {
  mode: MatchMode
  boards: UltimateBoard[]
  /** Nullbasiert. Steigt erst, wenn alle noch laufenden Bretter dran waren. */
  round: number
  /** Pro Brett: welche Zeichen in dieser Runde bereits gezogen haben. */
  progress: RoundProgress[]
  score: Score
  finished: boolean
  winner: TeamId | 'draw' | null
}

export function boardCount(mode: MatchMode): number {
  return mode === '2v2' ? 2 : 1
}

export function seatCount(mode: MatchMode): number {
  return mode === '2v2' ? 4 : 2
}

/**
 * Plaetze eines Teams, in Rotationsreihenfolge.
 * 1v1: X = [0], O = [1]. 2v2: X = [0, 1] (A, B), O = [2, 3] (C, D).
 */
export function teamSeats(mode: MatchMode, team: TeamId): number[] {
  if (mode === '2v2') return team === 'X' ? [0, 1] : [2, 3]
  return team === 'X' ? [0] : [1]
}

export function teamOfSeat(mode: MatchMode, seat: number): TeamId | null {
  if (teamSeats(mode, 'X').includes(seat)) return 'X'
  if (teamSeats(mode, 'O').includes(seat)) return 'O'
  return null
}

/** Welcher Platz besetzt in dieser Runde den Teamplatz an diesem Brett. */
export function seatAt(mode: MatchMode, team: TeamId, board: number, round: number): number {
  const seats = teamSeats(mode, team)
  return seats[(round + board) % seats.length]
}

export function createMatch(mode: MatchMode): MatchState {
  const boards = Array.from({ length: boardCount(mode) }, createBoard)
  return {
    mode,
    boards,
    round: 0,
    progress: boards.map(() => ({ X: false, O: false })),
    score: { X: 0, O: 0 },
    finished: false,
    winner: null
  }
}

/**
 * Welches Zeichen ist an diesem Brett als Naechstes dran, oder null, wenn das
 * Brett fertig ist oder sein Zugpaar in dieser Runde schon hatte.
 */
export function pendingTeam(match: MatchState, board: number): TeamId | null {
  if (board < 0 || board >= match.boards.length) return null
  if (isBoardFinished(match.boards[board])) return null

  const progress = match.progress[board]
  if (!progress.X) return 'X'
  if (!progress.O) return 'O'
  return null
}

export interface PendingMove {
  board: number
  team: TeamId
  seat: number
}

/**
 * Alle Spieler, die gerade ziehen duerfen. Im 2v2 sind das zu Beginn einer
 * Runde zwei — einer je Brett. Deshalb Liste statt Einzelwert.
 */
export function pendingMoves(match: MatchState): PendingMove[] {
  if (match.finished) return []

  const pending: PendingMove[] = []
  match.boards.forEach((_, board) => {
    const team = pendingTeam(match, board)
    if (team === null) return
    pending.push({ board, team, seat: seatAt(match.mode, team, board, match.round) })
  })

  return pending
}

export function legalMovesOn(match: MatchState, board: number): Move[] {
  if (board < 0 || board >= match.boards.length) return []
  if (pendingTeam(match, board) === null) return []
  return legalMoves(match.boards[board])
}

export type MatchMoveError =
  | 'match-finished'
  | 'no-such-board'
  | 'no-such-seat'
  | 'board-finished'
  | 'already-moved-this-round'
  | 'not-your-turn'
  | MoveError

export type MatchMoveResult =
  | { ok: true; match: MatchState; roundAdvanced: boolean }
  | { ok: false; error: MatchMoveError }

/** Runde ist vorbei, wenn jedes Brett entweder fertig ist oder X und O hatte. */
function roundComplete(match: MatchState): boolean {
  return match.boards.every((board, index) => {
    if (isBoardFinished(board)) return true
    const progress = match.progress[index]
    return progress.X && progress.O
  })
}

export function applyMatchMove(
  match: MatchState,
  seat: number,
  board: number,
  move: Move
): MatchMoveResult {
  if (match.finished) return { ok: false, error: 'match-finished' }
  if (!Number.isInteger(board) || board < 0 || board >= match.boards.length) {
    return { ok: false, error: 'no-such-board' }
  }
  if (!Number.isInteger(seat) || seat < 0 || seat >= seatCount(match.mode)) {
    return { ok: false, error: 'no-such-seat' }
  }
  if (isBoardFinished(match.boards[board])) return { ok: false, error: 'board-finished' }

  const team = pendingTeam(match, board)
  if (team === null) return { ok: false, error: 'already-moved-this-round' }

  // Der Platz entscheidet, nicht das Team: im 2v2 sitzt pro Runde nur *ein*
  // Teammitglied an diesem Brett. Der Partner darf hier nicht ziehen, auch
  // wenn sein Team an der Reihe ist.
  if (seatAt(match.mode, team, board, match.round) !== seat) {
    return { ok: false, error: 'not-your-turn' }
  }

  const applied = applyMove(match.boards[board], move, team)
  if (!applied.ok) return { ok: false, error: applied.error }

  const boards = match.boards.slice()
  boards[board] = applied.board

  const progress = match.progress.map((entry, index) =>
    index === board ? { ...entry, [team]: true } : { ...entry }
  ) as RoundProgress[]

  let next: MatchState = {
    ...match,
    boards,
    progress,
    score: boards.map(scoreBoard).reduce(addScores, { X: 0, O: 0 })
  }

  const finished = boards.every(isBoardFinished)
  if (finished) {
    next = {
      ...next,
      finished: true,
      winner: next.score.X > next.score.O ? 'X' : next.score.O > next.score.X ? 'O' : 'draw'
    }
    return { ok: true, match: next, roundAdvanced: false }
  }

  if (roundComplete(next)) {
    next = {
      ...next,
      round: next.round + 1,
      progress: next.boards.map(() => ({ X: false, O: false }))
    }
    return { ok: true, match: next, roundAdvanced: true }
  }

  return { ok: true, match: next, roundAdvanced: false }
}
