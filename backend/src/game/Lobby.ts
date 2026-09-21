import { v4 as uuidv4 } from 'uuid'
import { Player, GameSettings, TextEntry, GameArchive } from 'shared/types'

export class Lobby {
  private code: string
  private players: Map<string, Player> = new Map()
  private playerOrder: string[] = []
  private hostId: string
  private gameStarted: boolean = false
  private gameEnded: boolean = false
  private currentRound: number = 0
  private settings: GameSettings
  private sheets: Map<string, TextEntry[]> = new Map() // ownerId -> Texts
  private submissionsByRound: Map<number, Set<string>> = new Map()
  private votingActive: boolean = false
  private votes: Map<string, number> = new Map()
  private pendingArchive: GameArchive | null = null
  private archiveId: string = uuidv4()
  private archiveDate: string = new Date().toISOString()
  // Deadline (ms epoch) until which a disconnected player can still reconnect.
  // Absent from the map = player is connected. A null value = disconnected
  // with no deadline at all (running game, see io.ts) — the player keeps their
  // seat until they come back, are kicked, or the process restarts.
  private disconnectDeadlines: Map<string, number | null> = new Map()
  // Sheets belonging to players who were removed (kick/leave/eviction) DURING
  // an active game. These sheets contain text written by OTHER (still active)
  // players via the round-robin assignment, so we must keep them around so
  // those contributions appear in the final archive. Keyed by the original
  // owner's playerId so we can preserve their nickname in the archive.
  private orphanedSheets: Map<string, { nickname: string; sheet: TextEntry[] }> = new Map()
  // Players who joined while a game was already running. They sit out the
  // current round and are folded into the roster at the next round boundary,
  // because the round robin assigns sheets by position in playerOrder — adding
  // someone mid-round would hand everyone a different sheet than the one they
  // are writing on.
  private pendingPlayers: Map<string, Player> = new Map()

  constructor(code: string, hostId: string, hostNickname: string, settings: GameSettings) {
    this.code = code
    this.settings = settings
    this.hostId = hostId

    // Add host as first player
    const host: Player = {
      id: hostId,
      nickname: hostNickname,
      isReady: false
    }
    this.players.set(hostId, host)
    this.playerOrder.push(hostId)
    this.sheets.set(hostId, [])
  }

  // Public Methods
  getCode(): string {
    return this.code
  }

  getId(): string {
    return this.archiveId
  }

  addPlayer(playerId: string, nickname: string): void {
    const player: Player = {
      id: playerId,
      nickname,
      isReady: false
    }

    // Joining a running game puts the player on the bench until the next round.
    if (this.gameStarted && !this.gameEnded) {
      this.pendingPlayers.set(playerId, player)
      return
    }

    this.players.set(playerId, player)
    this.playerOrder.push(playerId)
    if (!this.sheets.has(playerId)) {
      this.sheets.set(playerId, [])
    }
  }

  hasPlayer(playerId: string): boolean {
    return this.players.has(playerId) || this.pendingPlayers.has(playerId)
  }

  /** True while the player is waiting for the next round to be let in. */
  isPending(playerId: string): boolean {
    return this.pendingPlayers.has(playerId)
  }

  getPendingPlayers(): Player[] {
    return Array.from(this.pendingPlayers.values())
  }

  /**
   * Move everyone off the bench into the roster. Called at a round boundary and
   * when a new game starts, never in the middle of a round.
   */
  private promotePendingPlayers(): void {
    this.pendingPlayers.forEach((player, playerId) => {
      if (this.players.has(playerId)) return
      this.players.set(playerId, player)
      this.playerOrder.push(playerId)
      if (!this.sheets.has(playerId)) {
        this.sheets.set(playerId, [])
      }
    })
    this.pendingPlayers.clear()
  }

  updatePlayerNickname(playerId: string, nickname: string): void {
    const player = this.players.get(playerId) || this.pendingPlayers.get(playerId)
    if (player) {
      player.nickname = nickname
    }
  }

  removePlayer(playerId: string): void {
    const departing = this.players.get(playerId)
    const sheet = this.sheets.get(playerId)
    // If the game is in progress, the departing player's sheet may contain
    // text written by OTHER active players via the round-robin assignment.
    // Preserve it so those contributions still appear in the final archive.
    const gameActive = this.gameStarted && !this.gameEnded
    if (gameActive && departing && sheet && sheet.length > 0) {
      this.orphanedSheets.set(playerId, {
        nickname: departing.nickname,
        sheet: sheet
      })
    }
    this.players.delete(playerId)
    this.pendingPlayers.delete(playerId)
    this.playerOrder = this.playerOrder.filter(id => id !== playerId)
    this.sheets.delete(playerId)
    this.disconnectDeadlines.delete(playerId)
    if (this.hostId === playerId) {
      // Prefer a connected player as the new host so the lobby isn't stuck
      // waiting for a disconnected player to reconnect or get evicted.
      // Fall back to any remaining player if everyone is currently in the
      // reconnect grace window.
      const connected = this.playerOrder.filter(
        id => !this.disconnectDeadlines.has(id)
      )
      const next = connected[0] ?? this.playerOrder[0]
      if (next) {
        this.hostId = next
      }
    }
    // Prune any stale submissions / votes from removed player so that
    // haveAllPlayersSubmitted / haveAllPlayersVoted reflect the current
    // player set.
    this.submissionsByRound.forEach(set => set.delete(playerId))
    this.votes.delete(playerId)
  }

  /**
   * Transfer host to the specified player (or the next player in order if
   * not provided). Returns the new host's id, or null if no candidates.
   */
  transferHost(newHostId?: string): string | null {
    const candidate = newHostId && this.players.has(newHostId)
      ? newHostId
      : this.playerOrder.find(id => id !== this.hostId && this.players.has(id))
    if (!candidate) return null
    this.hostId = candidate
    return candidate
  }

  /**
   * Mark a player as disconnected. `graceMs` of 0 (or less) means the seat is
   * held indefinitely — used while a game is running so nobody is locked out
   * of a match they are in the middle of. Returns false if the player is not
   * part of this lobby.
   */
  markDisconnected(playerId: string, graceMs: number): boolean {
    if (!this.hasPlayer(playerId)) return false
    const deadline = graceMs > 0 ? Date.now() + graceMs : null
    this.disconnectDeadlines.set(playerId, deadline)
    return true
  }

  markReconnected(playerId: string): void {
    this.disconnectDeadlines.delete(playerId)
  }

  isDisconnected(playerId: string): boolean {
    return this.disconnectDeadlines.has(playerId)
  }

  getDisconnectedPlayerIds(): string[] {
    return Array.from(this.disconnectDeadlines.keys())
  }

  setPlayerReady(playerId: string): void {
    const player = this.players.get(playerId)
    if (player) {
      player.isReady = !player.isReady // Toggle ready status
    }
  }

  getAllPlayersReady(): boolean {
    if (this.players.size === 0) return false
    return Array.from(this.players.values()).every(p => p.isReady)
  }

  resetReadyStatus(): void {
    this.players.forEach(player => {
      player.isReady = false
    })
  }

  startGame(): void {
    if (this.gameStarted && !this.gameEnded) {
      throw new Error('Game already started')
    }
    // Anyone who joined while the previous game was running plays this one
    // from the start, so they count towards the minimum.
    this.promotePendingPlayers()
    if (this.players.size < 3) {
      throw new Error('Need at least 3 players')
    }

    this.archiveId = uuidv4()
    this.archiveDate = new Date().toISOString()
    this.sheets = new Map()
    this.players.forEach((_, playerId) => {
      this.sheets.set(playerId, [])
    })
    // Clear sheets orphaned by mid-game removal in any previous game on this
    // lobby instance. Without this, a re-started game would carry over phantom
    // players into its archive via collectArchiveData().
    this.orphanedSheets.clear()
    this.submissionsByRound.clear()
    this.shufflePlayerOrder()
    this.gameEnded = false
    this.votingActive = false
    this.votes.clear()
    this.pendingArchive = null
    this.gameStarted = true
    this.currentRound = 1
    this.submissionsByRound.set(this.currentRound, new Set())
  }

  submitText(playerId: string, text: string): void {
    if (!this.gameStarted) {
      throw new Error('Game not started')
    }
    if (this.gameEnded) {
      throw new Error('Game ended')
    }
    if (this.hasPlayerSubmitted(playerId, this.currentRound)) {
      throw new Error('Text already submitted')
    }

    const sheetOwner = this.getAssignedSheetOwner(playerId, this.currentRound)
    const sheet = this.sheets.get(sheetOwner)
    if (!sheet) {
      throw new Error('Sheet not found')
    }

    const author = this.players.get(playerId)?.nickname || 'Unknown'
    const lines = this.currentRound === 1
      ? text.split('\n').map(line => line.trim()).filter(Boolean)
      : [text.trim()]

    if (this.currentRound === 1 && lines.length < 2) {
      throw new Error('Need two lines in first round')
    }

    lines.slice(0, this.currentRound === 1 ? 2 : 1).forEach(lineText => {
      const entry: TextEntry = {
        lineNumber: sheet.length + 1,
        text: lineText,
        author,
        timestamp: Date.now()
      }
      sheet.push(entry)
    })

    if (!this.submissionsByRound.has(this.currentRound)) {
      this.submissionsByRound.set(this.currentRound, new Set())
    }
    this.submissionsByRound.get(this.currentRound)!.add(playerId)
  }

  nextRound(): void {
    if (this.gameEnded) {
      throw new Error('Game ended')
    }
    if (!this.haveAllPlayersSubmitted()) {
      throw new Error('Round is not complete')
    }
    // A round boundary is the only safe moment to let latecomers in: nobody is
    // mid-sheet, so the changed rotation cannot pull a sheet out from under
    // anyone. Their own sheet starts empty and stays shorter than the rest.
    this.promotePendingPlayers()
    this.currentRound++
    this.submissionsByRound.set(this.currentRound, new Set())
  }

  haveAllPlayersSubmitted(): boolean {
    const submissions = this.submissionsByRound.get(this.currentRound)
    if (!submissions) return false
    return submissions.size >= this.players.size
  }

  getAssignedSheetOwner(playerId: string, roundNumber: number): string {
    const order = this.playerOrder
    const index = order.indexOf(playerId)
    if (index === -1 || order.length === 0) {
      throw new Error('Player not in lobby')
    }
    const offset = (roundNumber - 1) % order.length
    const ownerIndex = (index + offset) % order.length
    return order[ownerIndex]
  }

  getPromptForPlayer(playerId: string): string {
    if (this.currentRound <= 1) return ''
    const sheetOwner = this.getAssignedSheetOwner(playerId, this.currentRound)
    const sheet = this.sheets.get(sheetOwner) || []
    if (!sheet.length) return ''
    return sheet[sheet.length - 1].text
  }

  /**
   * Build the archive payload. Includes both active players' sheets and any
   * sheets orphaned by mid-game removal (kick/leave/eviction) so that text
   * written by still-active players on those sheets is preserved.
   */
  private collectArchiveData(): {
    players: string[]
    rounds: TextEntry[][]
    finalTexts: string[]
  } {
    const players: string[] = []
    const rounds: TextEntry[][] = []
    const finalTexts: string[] = []
    this.playerOrder.forEach(ownerId => {
      const player = this.players.get(ownerId)
      const sheet = this.sheets.get(ownerId) || []
      players.push(player ? player.nickname : ownerId)
      rounds.push(sheet)
      finalTexts.push(sheet.map(entry => entry.text).join('\n'))
    })
    this.orphanedSheets.forEach(({ nickname, sheet }) => {
      players.push(nickname)
      rounds.push(sheet)
      finalTexts.push(sheet.map(entry => entry.text).join('\n'))
    })
    return { players, rounds, finalTexts }
  }

  endGame(): GameArchive {
    this.gameEnded = true
    this.votingActive = true

    const { players, rounds, finalTexts } = this.collectArchiveData()

    const archive: GameArchive = {
      id: this.archiveId,
      lobbyCode: this.code,
      date: this.archiveDate,
      players,
      rounds,
      finalTexts
    }

    return archive
  }

  buildArchiveSnapshot(): GameArchive {
    const { players, rounds, finalTexts } = this.collectArchiveData()

    return {
      id: this.archiveId,
      lobbyCode: this.code,
      date: this.archiveDate,
      players,
      rounds,
      finalTexts
    }
  }

  getState() {
    const submittedPlayers = Array.from(this.submissionsByRound.get(this.currentRound) || [])
    // Players held indefinitely (deadline null) are reported as disconnected
    // but without an entry here, so the UI shows "Getrennt" without a countdown.
    const disconnectDeadlines: Record<string, number> = {}
    this.disconnectDeadlines.forEach((deadline, id) => {
      if (deadline !== null) {
        disconnectDeadlines[id] = deadline
      }
    })
    return {
      lobbyCode: this.code,
      players: this.playerOrder.map(id => this.players.get(id)).filter(Boolean) as Player[],
      hostId: this.hostId,
      currentRound: this.currentRound,
      maxRounds: this.getMaxRounds(),
      gameStarted: this.gameStarted,
      gameEnded: this.gameEnded,
      roundComplete: submittedPlayers.length >= this.players.size && this.players.size > 0,
      votingActive: this.votingActive,
      submittedPlayerIds: submittedPlayers,
      votedPlayerIds: Array.from(this.votes.keys()),
      disconnectedPlayerIds: Array.from(this.disconnectDeadlines.keys()),
      disconnectDeadlines,
      pendingPlayers: this.getPendingPlayers(),
      settings: this.settings
    }
  }

  getHostId(): string {
    return this.hostId
  }

  getPlayers(): Player[] {
    return Array.from(this.players.values())
  }

  getPlayerCount(): number {
    return this.players.size
  }

  getMaxRounds(): number {
    return 0
  }

  isLobbyFull(): boolean {
    return false
  }

  isEmpty(): boolean {
    return this.players.size === 0 && this.pendingPlayers.size === 0
  }

  startVoting(): string[] {
    if (this.votingActive && this.pendingArchive) {
      return this.pendingArchive.finalTexts
    }
    if (!this.pendingArchive) {
      this.pendingArchive = this.endGame()
    }
    this.votingActive = true
    this.votes.clear()
    return this.pendingArchive.finalTexts
  }

  submitVote(playerId: string, textIndex: number): void {
    if (!this.votingActive || !this.pendingArchive) {
      throw new Error('Voting not active')
    }
    if (this.votes.has(playerId)) {
      throw new Error('Vote already submitted')
    }
    if (textIndex < 0 || textIndex >= this.pendingArchive.finalTexts.length) {
      throw new Error('Invalid vote')
    }
    this.votes.set(playerId, textIndex)
  }

  haveAllPlayersVoted(): boolean {
    return this.votes.size >= this.players.size
  }

  getVotingResults(): number[] {
    if (!this.pendingArchive) return []
    const counts = new Array(this.pendingArchive.finalTexts.length).fill(0)
    this.votes.forEach(index => {
      counts[index] += 1
    })
    return counts
  }

  getPendingArchive(): GameArchive | null {
    return this.pendingArchive
  }

  getOrCreatePendingArchive(): GameArchive {
    if (!this.pendingArchive) {
      this.pendingArchive = this.endGame()
    }
    return this.pendingArchive
  }

  hasPlayerSubmitted(playerId: string, roundNumber: number = this.currentRound): boolean {
    return this.submissionsByRound.get(roundNumber)?.has(playerId) ?? false
  }

  private shufflePlayerOrder(): void {
    for (let i = this.playerOrder.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[this.playerOrder[i], this.playerOrder[j]] = [this.playerOrder[j], this.playerOrder[i]]
    }
  }

  // Passing order is fixed by the shuffled player order.
}
