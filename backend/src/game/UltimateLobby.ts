import { v4 as uuidv4 } from 'uuid'
import {
  MatchMode,
  MatchState,
  PendingMove,
  TeamId,
  applyMatchMove,
  createMatch,
  legalMovesOn,
  pendingMoves,
  seatCount,
  teamOfSeat
} from './UltimateMatch'
import { Move, Score, UltimateBoard } from './UltimateEngine'

export interface UltimatePlayer {
  id: string
  name: string
  isHost: boolean
  reconnectKey: string
  isDisconnected: boolean
  reconnectDeadline: number | null
  /**
   * Platz 0..1 (1v1) bzw. 0..3 (2v2), oder null fuer Zuschauer. Der Platz
   * bestimmt Team *und* Startseite, deshalb wird er in der Lobby bewusst
   * gewaehlt und nicht ausgelost.
   */
  seat: number | null
}

export type UltimatePhase = 'waiting' | 'playing' | 'finished'

/**
 * Spielerdaten, wie sie an *alle* gehen. Ohne reconnectKey: der ist das
 * einzige Geheimnis, das eine Session uebernehmen laesst, und hat in einem
 * Broadcast nichts verloren. Er geht nur im Ack an den Spieler selbst.
 */
export type UltimatePublicPlayer = Omit<UltimatePlayer, 'reconnectKey'>

/** Was der Client ueber eine laufende Partie erfaehrt. */
export interface UltimateMatchView {
  boards: UltimateBoard[]
  round: number
  score: Score
  finished: boolean
  winner: TeamId | 'draw' | null
  /** Wer gerade ziehen darf — im 2v2 zu Rundenbeginn zwei Eintraege. */
  pending: PendingMove[]
  /**
   * Je Brett die erlaubten Zuege. Der Server rechnet das aus, damit das
   * Frontend die Regeln nicht noch einmal nachbauen muss und auch nicht von
   * ihnen abweichen kann.
   */
  legal: Move[][]
}

export interface UltimateState {
  code: string
  phase: UltimatePhase
  mode: MatchMode
  hostId: string
  players: UltimatePublicPlayer[]
  /** Platzindex -> Spieler-ID, oder null wenn frei. */
  seats: (string | null)[]
  match: UltimateMatchView | null
}

export class UltimateLobby {
  private code: string
  private hostId: string
  private players: Map<string, UltimatePlayer> = new Map()
  private phase: UltimatePhase = 'waiting'
  private mode: MatchMode = '1v1'
  private match: MatchState | null = null

  constructor(code: string, hostId: string, hostName: string) {
    this.code = code
    this.hostId = hostId

    this.players.set(hostId, {
      id: hostId,
      name: hostName,
      isHost: true,
      reconnectKey: uuidv4(),
      isDisconnected: false,
      reconnectDeadline: null,
      seat: null
    })
  }

  getCode(): string {
    return this.code
  }

  getHostId(): string {
    return this.hostId
  }

  getPhase(): UltimatePhase {
    return this.phase
  }

  getMode(): MatchMode {
    return this.mode
  }

  getPlayers(): UltimatePlayer[] {
    return Array.from(this.players.values())
  }

  getPlayer(playerId: string): UltimatePlayer | null {
    return this.players.get(playerId) || null
  }

  hasPlayer(playerId: string): boolean {
    return this.players.has(playerId)
  }

  hasPlayerName(playerName: string): boolean {
    const normalized = playerName.trim().toLowerCase()
    return this.getPlayers().some(player => player.name.trim().toLowerCase() === normalized)
  }

  findPlayerByReconnectKey(reconnectKey: string): UltimatePlayer | null {
    return this.getPlayers().find(player => player.reconnectKey === reconnectKey) || null
  }

  getReconnectToken(playerId: string): string | null {
    return this.players.get(playerId)?.reconnectKey || null
  }

  addPlayer(playerId: string, playerName: string): UltimatePlayer {
    const existing = this.players.get(playerId)
    if (existing) return existing

    const player: UltimatePlayer = {
      id: playerId,
      name: playerName,
      isHost: false,
      reconnectKey: uuidv4(),
      isDisconnected: false,
      reconnectDeadline: null,
      seat: null
    }

    this.players.set(playerId, player)
    return player
  }

  /** Die Lobby hat niemanden mehr, der neue Spieler uebernimmt sie. */
  adoptEmptyLobby(playerId: string): void {
    const player = this.players.get(playerId)
    if (!player) return
    this.hostId = playerId
    player.isHost = true
  }

  removePlayer(playerId: string): void {
    const player = this.players.get(playerId)
    if (!player) return

    const hadSeat = player.seat !== null
    this.players.delete(playerId)

    if (this.hostId === playerId) this.transferHost()

    // Verlaesst jemand mit Platz eine laufende Partie endgueltig, kann sie
    // nicht weitergehen: an seinem Platz wuerde fuer immer gewartet. Die Partie
    // wird deshalb abgebrochen und die Lobby faellt zurueck ins Warten. Ein
    // blosser Verbindungsabbruch loest das nicht aus — dafuer gibt es die
    // Reconnect-Frist, siehe markDisconnected.
    if (hadSeat && this.phase === 'playing') {
      this.abortMatch()
    }
  }

  private transferHost(): void {
    const next = this.getPlayers()[0]
    if (!next) {
      this.hostId = ''
      return
    }
    this.hostId = next.id
    next.isHost = true
  }

  isDisconnected(playerId: string): boolean {
    return this.players.get(playerId)?.isDisconnected === true
  }

  markDisconnected(playerId: string, deadline: number | null): void {
    const player = this.players.get(playerId)
    if (!player) return
    player.isDisconnected = true
    player.reconnectDeadline = deadline
  }

  markConnected(playerId: string): void {
    const player = this.players.get(playerId)
    if (!player) return
    player.isDisconnected = false
    player.reconnectDeadline = null
  }

  // --- Plaetze -------------------------------------------------------------

  getSeats(): (string | null)[] {
    const seats: (string | null)[] = new Array(seatCount(this.mode)).fill(null)
    this.players.forEach(player => {
      if (player.seat !== null && player.seat < seats.length) seats[player.seat] = player.id
    })
    return seats
  }

  getSeatOf(playerId: string): number | null {
    return this.players.get(playerId)?.seat ?? null
  }

  getPlayerAtSeat(seat: number): UltimatePlayer | null {
    return this.getPlayers().find(player => player.seat === seat) || null
  }

  /**
   * Modus wechseln. Nur im Warteraum, und Plaetze ausserhalb des neuen Modus
   * werden frei — sonst sitzt nach dem Wechsel von 2v2 auf 1v1 jemand auf
   * Platz 3, den es nicht mehr gibt.
   */
  setMode(mode: MatchMode): boolean {
    if (this.phase !== 'waiting') return false
    this.mode = mode

    const limit = seatCount(mode)
    this.players.forEach(player => {
      if (player.seat !== null && player.seat >= limit) player.seat = null
    })

    return true
  }

  takeSeat(playerId: string, seat: number | null): boolean {
    if (this.phase !== 'waiting') return false

    const player = this.players.get(playerId)
    if (!player) return false

    if (seat === null) {
      player.seat = null
      return true
    }

    if (!Number.isInteger(seat) || seat < 0 || seat >= seatCount(this.mode)) return false
    if (this.getPlayers().some(other => other.id !== playerId && other.seat === seat)) return false

    player.seat = seat
    return true
  }

  /** Alle Plaetze besetzt und niemand davon abgemeldet. */
  canStart(): boolean {
    if (this.phase !== 'waiting') return false
    return this.getSeats().every(id => id !== null)
  }

  startGame(): boolean {
    if (!this.canStart()) return false
    this.match = createMatch(this.mode)
    this.phase = 'playing'
    return true
  }

  private abortMatch(): void {
    this.match = null
    this.phase = 'waiting'
  }

  /** Neue Partie mit denselben Plaetzen. */
  playAgain(): boolean {
    if (this.phase !== 'finished') return false
    if (!this.getSeats().every(id => id !== null)) {
      this.phase = 'waiting'
      this.match = null
      return false
    }
    this.match = createMatch(this.mode)
    this.phase = 'playing'
    return true
  }

  /** Zurueck in den Warteraum, Plaetze bleiben besetzt. */
  returnToLobby(): void {
    this.match = null
    this.phase = 'waiting'
  }

  getMatch(): MatchState | null {
    return this.match
  }

  teamOf(playerId: string): TeamId | null {
    const seat = this.getSeatOf(playerId)
    if (seat === null) return null
    return teamOfSeat(this.mode, seat)
  }

  move(playerId: string, board: number, move: Move): { ok: true } | { ok: false; error: string } {
    if (this.phase !== 'playing' || !this.match) return { ok: false, error: 'not-playing' }

    const seat = this.getSeatOf(playerId)
    if (seat === null) return { ok: false, error: 'no-seat' }

    const result = applyMatchMove(this.match, seat, board, move)
    if (!result.ok) return { ok: false, error: result.error }

    this.match = result.match
    if (this.match.finished) this.phase = 'finished'

    return { ok: true }
  }

  private matchView(): UltimateMatchView | null {
    if (!this.match) return null
    return {
      boards: this.match.boards,
      round: this.match.round,
      score: this.match.score,
      finished: this.match.finished,
      winner: this.match.winner,
      pending: pendingMoves(this.match),
      legal: this.match.boards.map((_, index) => legalMovesOn(this.match as MatchState, index))
    }
  }

  getState(): UltimateState {
    return {
      code: this.code,
      phase: this.phase,
      mode: this.mode,
      hostId: this.hostId,
      players: this.getPlayers().map(toPublicPlayer),
      seats: this.getSeats(),
      match: this.matchView()
    }
  }
}

function toPublicPlayer(player: UltimatePlayer): UltimatePublicPlayer {
  const { reconnectKey: _reconnectKey, ...rest } = player
  return rest
}
