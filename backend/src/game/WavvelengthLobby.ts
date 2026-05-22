import { v4 as uuidv4 } from 'uuid'

export interface WavvelengthPlayer {
  id: string
  name: string
  isHost: boolean
  reconnectKey: string
  isDisconnected?: boolean
  reconnectDeadline?: number | null
}

export interface QuestionAndAnswer {
  playerId: string
  playerName: string
  question: string
  answer: string
}

export interface WavvelengthArchiveRound {
  seekerId: string
  seekerName: string
  targetNumber: number
  questionsAndAnswers: QuestionAndAnswer[]
  seekerGuess: number
  isCorrect: boolean
}

export interface WavvelengthArchive {
  id: string
  lobbyCode: string
  date: string
  players: string[]
  rounds: WavvelengthArchiveRound[]
}

type WavvelengthPhase = 'waiting' | 'voting' | 'playing' | 'result'

export class WavvelengthLobby {
  private code: string
  private players: Map<string, WavvelengthPlayer> = new Map()
  private hostId: string
  private state: WavvelengthPhase = 'waiting'
  private votes: Map<string, number> = new Map()
  private selectedNumber: number | null = null
  private seekerId: string | null = null
  private questionsAndAnswers: QuestionAndAnswer[] = []
  private seekerGuess: number | null = null
  private archive: WavvelengthArchive | null = null

  constructor(code: string, hostId: string, hostName: string) {
    this.code = code
    this.hostId = hostId

    const host: WavvelengthPlayer = {
      id: hostId,
      name: hostName,
      isHost: true,
      reconnectKey: this.generateReconnectKey(),
      isDisconnected: false,
      reconnectDeadline: null
    }

    this.players.set(hostId, host)
  }

  getCode(): string {
    return this.code
  }

  getPhase(): WavvelengthPhase {
    return this.state
  }

  getPlayers(): WavvelengthPlayer[] {
    return Array.from(this.players.values())
  }

  getActivePlayers(): WavvelengthPlayer[] {
    return this.getPlayers().filter(player => !player.isDisconnected)
  }

  getState(): {
    code: string
    state: WavvelengthPhase
    players: WavvelengthPlayer[]
  } {
    return {
      code: this.code,
      state: this.state,
      players: this.getPlayers()
    }
  }

  getHostId(): string {
    return this.hostId
  }

  getPlayer(playerId: string): WavvelengthPlayer | null {
    return this.players.get(playerId) || null
  }

  findPlayerByReconnectKey(reconnectKey: string): WavvelengthPlayer | null {
    return this.getPlayers().find(player => player.reconnectKey === reconnectKey) || null
  }

  addPlayer(playerId: string, playerName: string): WavvelengthPlayer {
    const existing = this.players.get(playerId)
    if (existing) {
      return existing
    }

    const player: WavvelengthPlayer = {
      id: playerId,
      name: playerName,
      isHost: false,
      reconnectKey: this.generateReconnectKey(),
      isDisconnected: false,
      reconnectDeadline: null
    }

    this.players.set(playerId, player)
    return player
  }

  hasPlayer(playerId: string): boolean {
    return this.players.has(playerId)
  }

  hasPlayerName(playerName: string): boolean {
    const normalized = playerName.trim().toLowerCase()
    return this.getPlayers().some(player => player.name.trim().toLowerCase() === normalized)
  }

  removePlayer(playerId: string): void {
    const removedPlayer = this.players.get(playerId)
    if (!removedPlayer) return

    this.players.delete(playerId)
    this.votes.delete(playerId)
    this.questionsAndAnswers = this.questionsAndAnswers.filter(entry => entry.playerId !== playerId)

    if (playerId === this.hostId) {
      this.transferHost()
    }

    this.normalizeStateAfterRosterChange(playerId)
  }

  isDisconnected(playerId: string): boolean {
    return !!this.players.get(playerId)?.isDisconnected
  }

  markDisconnected(playerId: string, deadline: number): void {
    const player = this.players.get(playerId)
    if (!player) return

    player.isDisconnected = true
    player.reconnectDeadline = deadline
    this.normalizeStateAfterRosterChange()
  }

  markConnected(playerId: string): void {
    const player = this.players.get(playerId)
    if (!player) return

    player.isDisconnected = false
    player.reconnectDeadline = null
  }

  getReconnectToken(playerId: string): string | null {
    return this.players.get(playerId)?.reconnectKey || null
  }

  startVoting(): void {
    if (this.getActivePlayers().length < 2) {
      throw new Error('Mindestens 2 verbundene Spieler sind erforderlich.')
    }

    this.resetRoundState('voting')
  }

  submitVote(playerId: string, number: number): boolean {
    if (this.state !== 'voting') return false
    if (!Number.isInteger(number) || number < 1 || number > 10) return false

    const player = this.players.get(playerId)
    if (!player || player.isDisconnected) return false

    this.votes.set(playerId, number)
    return true
  }

  haveAllPlayersVoted(): boolean {
    const activePlayers = this.getActivePlayers()
    if (activePlayers.length < 2) return false

    return activePlayers.every(player => this.votes.has(player.id))
  }

  determineSeekerAndNumber(): { seekerId: string; number: number } {
    const activePlayers = this.getActivePlayers()
    if (activePlayers.length < 2) {
      throw new Error('Nicht genug aktive Spieler für eine Runde.')
    }

    const voteCounts = new Map<number, number>()
    activePlayers.forEach(player => {
      const vote = this.votes.get(player.id)
      if (typeof vote === 'number') {
        voteCounts.set(vote, (voteCounts.get(vote) || 0) + 1)
      }
    })

    if (voteCounts.size === 0) {
      throw new Error('Es wurden keine gültigen Stimmen abgegeben.')
    }

    let selectedNumber = 1
    let maxVotes = -1
    voteCounts.forEach((count, number) => {
      if (count > maxVotes) {
        maxVotes = count
        selectedNumber = number
      }
    })

    const randomSeeker = activePlayers[Math.floor(Math.random() * activePlayers.length)]
    this.selectedNumber = selectedNumber
    this.seekerId = randomSeeker.id

    return { seekerId: randomSeeker.id, number: selectedNumber }
  }

  startGame(): void {
    if (!this.seekerId || this.selectedNumber === null) {
      throw new Error('Seeker oder Zielzahl fehlen.')
    }

    this.state = 'playing'
    this.questionsAndAnswers = []
    this.seekerGuess = null
  }

  getSeekerInfo(): { seekerId: string; number: number } | null {
    if (!this.seekerId || this.selectedNumber === null) return null

    return {
      seekerId: this.seekerId,
      number: this.selectedNumber
    }
  }

  getQuestionsAndAnswers(): QuestionAndAnswer[] {
    return this.questionsAndAnswers.map(entry => ({ ...entry }))
  }

  getPendingQuestionForPlayer(playerId: string): QuestionAndAnswer | null {
    for (let index = this.questionsAndAnswers.length - 1; index >= 0; index -= 1) {
      const entry = this.questionsAndAnswers[index]
      if (entry.playerId === playerId && entry.answer === '') {
        return entry
      }
    }

    return null
  }

  hasAnsweredQuestion(playerId: string): boolean {
    return this.questionsAndAnswers.some(entry => entry.playerId === playerId && entry.answer !== '')
  }

  canPlayerAnswerQuestion(playerId: string): boolean {
    return !!this.getPendingQuestionForPlayer(playerId)
  }

  canSeekerGuess(): boolean {
    if (this.state !== 'playing' || !this.seekerId) return false

    const otherActivePlayers = this.getActivePlayers().filter(player => player.id !== this.seekerId)
    if (otherActivePlayers.length === 0) return false

    return otherActivePlayers.every(player => this.hasAnsweredQuestion(player.id))
  }

  askQuestion(seekerId: string, targetPlayerId: string, question: string): boolean {
    if (this.state !== 'playing') return false
    if (seekerId !== this.seekerId) return false
    if (!question.trim()) return false
    if (targetPlayerId === seekerId) return false

    const targetPlayer = this.players.get(targetPlayerId)
    if (!targetPlayer || targetPlayer.isDisconnected) return false

    if (this.questionsAndAnswers.some(entry => entry.playerId === targetPlayerId)) {
      return false
    }

    this.questionsAndAnswers.push({
      playerId: targetPlayerId,
      playerName: targetPlayer.name,
      question: question.trim(),
      answer: ''
    })

    return true
  }

  answerQuestion(playerId: string, answer: string): boolean {
    if (this.state !== 'playing') return false
    if (!answer.trim()) return false

    const player = this.players.get(playerId)
    if (!player || player.isDisconnected) return false

    const pendingQuestion = this.getPendingQuestionForPlayer(playerId)
    if (!pendingQuestion) return false

    pendingQuestion.answer = answer.trim()
    return true
  }

  makeGuess(seekerId: string, guess: number): boolean {
    if (this.state !== 'playing') return false
    if (seekerId !== this.seekerId) return false
    if (!Number.isInteger(guess) || guess < 1 || guess > 10) return false
    if (!this.canSeekerGuess()) return false

    this.seekerGuess = guess
    this.state = 'result'
    return true
  }

  getResult(): { correct: boolean; targetNumber: number; guess: number } | null {
    if (this.seekerGuess === null || this.selectedNumber === null) return null

    return {
      correct: this.seekerGuess === this.selectedNumber,
      targetNumber: this.selectedNumber,
      guess: this.seekerGuess
    }
  }

  resetForNewRound(): void {
    this.resetRoundState('waiting')
  }

  createArchiveSnapshot(): WavvelengthArchive {
    if (!this.archive) {
      this.archive = {
        id: uuidv4(),
        lobbyCode: this.code,
        date: new Date().toISOString(),
        players: this.getPlayers().map(player => player.name),
        rounds: []
      }
    }

    if (this.seekerId && this.selectedNumber !== null) {
      const seekerPlayer = this.players.get(this.seekerId)
      this.archive.rounds.push({
        seekerId: this.seekerId,
        seekerName: seekerPlayer?.name || 'Unknown',
        targetNumber: this.selectedNumber,
        questionsAndAnswers: this.questionsAndAnswers.map(entry => ({ ...entry })),
        seekerGuess: this.seekerGuess ?? 0,
        isCorrect: this.seekerGuess === this.selectedNumber
      })
    }

    return this.archive
  }

  private transferHost(): void {
    this.getPlayers().forEach(player => {
      player.isHost = false
    })

    const nextHost = this.getPlayers()[0]
    if (!nextHost) {
      this.hostId = ''
      return
    }

    nextHost.isHost = true
    this.hostId = nextHost.id
  }

  private resetRoundState(nextState: WavvelengthPhase): void {
    this.state = nextState
    this.votes.clear()
    this.selectedNumber = null
    this.seekerId = null
    this.questionsAndAnswers = []
    this.seekerGuess = null
  }

  private normalizeStateAfterRosterChange(removedPlayerId?: string): void {
    if (this.players.size === 0) return

    const activePlayers = this.getActivePlayers()

    if (activePlayers.length < 2) {
      this.resetRoundState('waiting')
      return
    }

    if (removedPlayerId && removedPlayerId === this.seekerId) {
      this.resetRoundState('waiting')
      return
    }

    if (this.seekerId) {
      const seeker = this.players.get(this.seekerId)
      if (!seeker || seeker.isDisconnected) {
        this.resetRoundState('waiting')
        return
      }
    }

    if (this.state === 'voting') {
      for (const [playerId] of this.votes) {
        const player = this.players.get(playerId)
        if (!player || player.isDisconnected) {
          this.votes.delete(playerId)
        }
      }
    }

    if (this.state === 'playing' || this.state === 'result') {
      this.questionsAndAnswers = this.questionsAndAnswers.filter(entry => {
        const player = this.players.get(entry.playerId)
        return !!player && !player.isDisconnected
      })
    }
  }

  private generateReconnectKey(): string {
    return uuidv4()
  }
}
