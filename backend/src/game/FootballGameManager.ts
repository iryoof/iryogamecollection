import { FootballLobby } from './FootballLobby'
import { generateLobbyCode } from '../utils/codeGenerator'

export class FootballGameManager {
  private lobbies: Map<string, FootballLobby> = new Map()
  private playerLobbies: Map<string, string> = new Map()

  createLobby(hostId: string, hostName: string) {
    let code = generateLobbyCode()
    while (this.lobbies.has(code)) {
      code = generateLobbyCode()
    }
    const lobby = new FootballLobby(code, hostId, hostName)
    this.lobbies.set(code, lobby)
    this.playerLobbies.set(hostId, code)
    console.log(`Football lobby created: ${code}`)
    return lobby
  }

  joinLobby(playerId: string, code: string, playerName: string) {
    const normalized = code.trim().toUpperCase()
    const existing = this.playerLobbies.get(playerId)
    if (existing && existing !== normalized) throw new Error('Player already in another lobby')
    const lobby = this.lobbies.get(normalized)
    if (!lobby) throw new Error('Lobby not found')
    lobby.addPlayer(playerId, playerName)
    this.playerLobbies.set(playerId, normalized)
    return lobby
  }

  findLobbyByPlayerId(playerId: string) {
    const code = this.playerLobbies.get(playerId)
    if (!code) return null
    return this.lobbies.get(code) || null
  }

  findLobbyByCode(code: string) {
    return this.lobbies.get(code.trim().toUpperCase()) || null
  }

  removeLobby(code: string) {
    const normalized = code.trim().toUpperCase()
    const lobby = this.lobbies.get(normalized)
    if (!lobby) return
    lobby.getPlayers().forEach(p => this.playerLobbies.delete(p.id))
    this.lobbies.delete(normalized)
  }

  removePlayer(playerId: string) {
    const code = this.playerLobbies.get(playerId)
    if (!code) return
    const lobby = this.lobbies.get(code)
    if (!lobby) {
      this.playerLobbies.delete(playerId)
      return
    }
    lobby.removePlayer(playerId)
    this.playerLobbies.delete(playerId)
    if (lobby.getPlayers().length === 0) this.lobbies.delete(code)
  }
}
