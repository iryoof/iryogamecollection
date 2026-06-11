import { generateLobbyCode } from '../utils/codeGenerator'
import { GameArchive } from 'shared/types'

export interface FootballPlayer {
  id: string
  name: string
  isHost?: boolean
  isDisconnected?: boolean
}

export class FootballLobby {
  private code: string
  private hostId: string
  private players: FootballPlayer[] = []

  constructor(code: string, hostId: string, hostName: string) {
    this.code = code || generateLobbyCode()
    this.hostId = hostId
    this.players.push({ id: hostId, name: hostName, isHost: true })
  }

  getCode() {
    return this.code
  }

  getHostId() {
    return this.hostId
  }

  addPlayer(id: string, name: string) {
    if (this.players.find(p => p.name === name)) {
      throw new Error('Name already taken')
    }
    this.players.push({ id, name })
  }

  removePlayer(id: string) {
    this.players = this.players.filter(p => p.id !== id)
    if (this.players.length > 0 && this.hostId === id) {
      this.hostId = this.players[0].id
      this.players[0].isHost = true
    }
  }

  hasPlayer(id: string) {
    return this.players.some(p => p.id === id)
  }

  getPlayers() {
    return this.players
  }

  isEmpty() {
    return this.players.length === 0
  }

  markDisconnected(id: string, graceMs: number) {
    const p = this.players.find(pl => pl.id === id)
    if (!p) return null
    p.isDisconnected = true
    return Date.now() + graceMs
  }

  markReconnected(id: string) {
    const p = this.players.find(pl => pl.id === id)
    if (!p) return
    p.isDisconnected = false
  }

  // Minimal archive builder for compatibility
  endGame(): GameArchive {
    return {
      id: `${this.code}-${Date.now()}`,
      lobbyCode: this.code,
      date: new Date().toISOString(),
      players: this.players.map(p => p.name),
      rounds: [],
      finalTexts: []
    }
  }
}
