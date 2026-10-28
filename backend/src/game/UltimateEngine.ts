/**
 * Regelwerk fuer "TikTacToe Ultimate" — reine Funktionen, kein Socket, kein
 * Spielerbegriff, kein Zustand ausserhalb der uebergebenen Objekte.
 *
 * Warum so getrennt: die 2v2-Variante dieses Spiels verschiebt nur, *wer* an
 * welchem Brett sitzt. Was auf einem Brett erlaubt ist und was es wert ist,
 * aendert sich dadurch nicht. Diese Datei haelt deshalb ausschliesslich die
 * Brettregeln; Sitzordnung und Rundentakt stehen in UltimateMatch.ts, Spieler
 * und Verbindungen in UltimateLobby.ts.
 *
 * Alle Funktionen hier sind seiteneffektfrei: sie geben neue Objekte zurueck,
 * statt die uebergebenen zu aendern. Bei 81 Zellen ist das billig, und es
 * verhindert die Klasse von Fehlern, bei denen ein verworfener Probezug den
 * echten Spielstand veraendert zurueck laesst.
 */

export type Mark = 'X' | 'O'

/** Inhalt einer Zelle: ein Zeichen oder leer. */
export type Cell = Mark | null

/**
 * Ergebnis eines Unterfelds oder eines ganzen Bretts.
 * `null` heisst "noch offen", nicht "unentschieden".
 */
export type Outcome = Mark | 'draw' | null

export interface SubBoard {
  /** Neun Zellen, zeilenweise: Index 0 ist oben links, Index 8 unten rechts. */
  cells: Cell[]
  result: Outcome
}

export interface UltimateBoard {
  /** Neun Unterfelder, zeilenweise wie die Zellen. */
  subs: SubBoard[]
  /**
   * Unterfeld, in das der naechste Zug muss. `null` bedeutet freie Wahl —
   * das passiert, wenn das durch den letzten Zug vorgegebene Unterfeld bereits
   * entschieden oder voll ist, und einmal zu Spielbeginn.
   */
  forcedSub: number | null
  result: Outcome
}

/** Die acht Dreierreihen in einem 3x3-Gitter, als Zellindizes. */
const LINES: ReadonlyArray<readonly [number, number, number]> = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8], // Zeilen
  [0, 3, 6], [1, 4, 7], [2, 5, 8], // Spalten
  [0, 4, 8], [2, 4, 6]             // Diagonalen
]

export function createSubBoard(): SubBoard {
  return { cells: new Array<Cell>(9).fill(null), result: null }
}

export function createBoard(): UltimateBoard {
  return {
    subs: Array.from({ length: 9 }, createSubBoard),
    forcedSub: null,
    result: null
  }
}

/**
 * Sieger einer Neunergruppe, oder null. Wird fuer Unterfelder *und* fuer das
 * Hauptgitter benutzt — beim Hauptgitter sind die "Zellen" die Ergebnisse der
 * Unterfelder, wobei ein unentschiedenes Unterfeld als leer zaehlt.
 */
export function winnerOf(cells: ReadonlyArray<Cell>): Mark | null {
  for (const [a, b, c] of LINES) {
    const value = cells[a]
    if (value !== null && value === cells[b] && value === cells[c]) return value
  }
  return null
}

function isSubFull(sub: SubBoard): boolean {
  return sub.cells.every(cell => cell !== null)
}

/** Ein Unterfeld ist bespielbar, solange es kein Ergebnis hat. */
export function isSubOpen(sub: SubBoard): boolean {
  return sub.result === null
}

export function isBoardFinished(board: UltimateBoard): boolean {
  return board.result !== null
}

/**
 * Das Hauptgitter aus Sicht der Gewinnpruefung: ein von X gewonnenes Unterfeld
 * ist ein X, ein unentschiedenes ist leer. Ein unentschiedenes Unterfeld hilft
 * also niemandem bei der Dreierreihe — passend dazu, dass es auch keinen Punkt
 * bringt.
 */
function metaCells(board: UltimateBoard): Cell[] {
  return board.subs.map(sub => (sub.result === 'X' || sub.result === 'O' ? sub.result : null))
}

export interface Move {
  /** Unterfeld 0..8. */
  sub: number
  /** Zelle innerhalb des Unterfelds, 0..8. */
  cell: number
}

/**
 * Alle Zuege, die gerade erlaubt sind. Der Server schickt diese Liste mit in
 * den Spielzustand, damit das Frontend die Regeln nicht noch einmal
 * nachbauen — und damit auch nicht von ihnen abweichen — muss.
 */
export function legalMoves(board: UltimateBoard): Move[] {
  if (isBoardFinished(board)) return []

  const moves: Move[] = []
  const candidates = board.forcedSub !== null ? [board.forcedSub] : board.subs.map((_, index) => index)

  for (const subIndex of candidates) {
    const sub = board.subs[subIndex]
    if (!isSubOpen(sub)) continue
    sub.cells.forEach((cell, cellIndex) => {
      if (cell === null) moves.push({ sub: subIndex, cell: cellIndex })
    })
  }

  return moves
}

export function isLegalMove(board: UltimateBoard, move: Move): boolean {
  if (isBoardFinished(board)) return false
  if (!Number.isInteger(move.sub) || move.sub < 0 || move.sub > 8) return false
  if (!Number.isInteger(move.cell) || move.cell < 0 || move.cell > 8) return false
  if (board.forcedSub !== null && board.forcedSub !== move.sub) return false

  const sub = board.subs[move.sub]
  return isSubOpen(sub) && sub.cells[move.cell] === null
}

export type MoveError =
  | 'board-finished'
  | 'out-of-range'
  | 'wrong-sub'
  | 'sub-closed'
  | 'cell-taken'

export type MoveResult =
  | { ok: true; board: UltimateBoard }
  | { ok: false; error: MoveError }

/**
 * Setzt ein Zeichen und gibt ein neues Brett zurueck. Das uebergebene Brett
 * bleibt unveraendert.
 */
export function applyMove(board: UltimateBoard, move: Move, mark: Mark): MoveResult {
  if (isBoardFinished(board)) return { ok: false, error: 'board-finished' }
  if (!Number.isInteger(move.sub) || move.sub < 0 || move.sub > 8) return { ok: false, error: 'out-of-range' }
  if (!Number.isInteger(move.cell) || move.cell < 0 || move.cell > 8) return { ok: false, error: 'out-of-range' }
  if (board.forcedSub !== null && board.forcedSub !== move.sub) return { ok: false, error: 'wrong-sub' }

  const targetSub = board.subs[move.sub]
  if (!isSubOpen(targetSub)) return { ok: false, error: 'sub-closed' }
  if (targetSub.cells[move.cell] !== null) return { ok: false, error: 'cell-taken' }

  const subs = board.subs.map((sub, index) => {
    if (index !== move.sub) return { cells: sub.cells.slice(), result: sub.result }

    const cells = sub.cells.slice()
    cells[move.cell] = mark

    const winner = winnerOf(cells)
    let result: Outcome = null
    if (winner !== null) result = winner
    else if (cells.every(value => value !== null)) result = 'draw'

    return { cells, result }
  })

  const next: UltimateBoard = { subs, forcedSub: null, result: null }

  // Brettsieg zuerst: drei eigene Unterfelder in einer Reihe beenden das Brett
  // sofort, die uebrigen Unterfelder bleiben ungespielt. Das ist Davids
  // Entscheidung vom 2026-10-28 und erzeugt die Abwaegung zwischen "schnell
  // abschliessen" und "weiter Unterfelder sammeln".
  const boardWinner = winnerOf(metaCells(next))
  if (boardWinner !== null) {
    next.result = boardWinner
    next.forcedSub = null
    return { ok: true, board: next }
  }

  // Kein Sieger und kein offenes Unterfeld mehr: das Brett ist unentschieden.
  if (next.subs.every(sub => !isSubOpen(sub))) {
    next.result = 'draw'
    next.forcedSub = null
    return { ok: true, board: next }
  }

  // Die gespielte *Zelle* bestimmt das naechste Unterfeld. Ist es schon
  // entschieden oder voll, darf frei gewaehlt werden (Standardregel).
  const forced = move.cell
  next.forcedSub = isSubOpen(next.subs[forced]) ? forced : null

  return { ok: true, board: next }
}

export interface Score {
  X: number
  O: number
}

/** Ein gewonnenes Unterfeld zaehlt 1, ein gewonnenes Brett zusaetzlich 3. */
export const POINTS_PER_SUB = 1
export const POINTS_PER_BOARD = 3

export function scoreBoard(board: UltimateBoard): Score {
  const score: Score = { X: 0, O: 0 }

  for (const sub of board.subs) {
    if (sub.result === 'X') score.X += POINTS_PER_SUB
    else if (sub.result === 'O') score.O += POINTS_PER_SUB
  }

  if (board.result === 'X') score.X += POINTS_PER_BOARD
  else if (board.result === 'O') score.O += POINTS_PER_BOARD

  return score
}

export function addScores(a: Score, b: Score): Score {
  return { X: a.X + b.X, O: a.O + b.O }
}
