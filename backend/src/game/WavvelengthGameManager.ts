import { WavvelengthLobby, WavvelengthPlayer } from './WavvelengthLobby'
import { generateLobbyCode } from '../utils/codeGenerator'

export class WavvelengthGameManager {
  private lobbies: Map<string, WavvelengthLobby> = new Map()
  private playerLobbies: Map<string, string> = new Map()

  createLobby(hostId: string, hostName: string): WavvelengthLobby {
    let code = generateLobbyCode()
    while (this.lobbies.has(code)) {
      code = generateLobbyCode()
    }

    const lobby = new WavvelengthLobby(code, hostId, hostName)
    this.lobbies.set(code, lobby)
    this.playerLobbies.set(hostId, code)

    console.log(`Wavvelength lobby created: ${code}`)
    return lobby
  }

  joinLobby(playerId: string, code: string, playerName: string): WavvelengthLobby {
    const normalizedCode = code.trim().toUpperCase()
    const existingCode = this.playerLobbies.get(playerId)
    if (existingCode && existingCode !== normalizedCode) {
      throw new Error('Player already in another lobby')
    }

    const lobby = this.lobbies.get(normalizedCode)
    if (!lobby) {
      throw new Error(`Lobby ${normalizedCode} not found`)
    }

    if (lobby.hasPlayerName(playerName)) {
      throw new Error('Name already taken')
    }

    lobby.addPlayer(playerId, playerName)
    this.playerLobbies.set(playerId, normalizedCode)

    console.log(`Player ${playerName} joined Wavvelength lobby ${normalizedCode}`)
    return lobby
  }

  findLobbyByPlayerId(playerId: string): WavvelengthLobby | null {
    const code = this.playerLobbies.get(playerId)
    if (!code) return null
    return this.lobbies.get(code) || null
  }

  findLobbyByCode(code: string): WavvelengthLobby | null {
    return this.lobbies.get(code.trim().toUpperCase()) || null
  }

  findPlayerByReconnectKey(reconnectKey: string, code?: string): { lobby: WavvelengthLobby; player: WavvelengthPlayer } | null {
    if (code) {
      const lobby = this.findLobbyByCode(code)
      const player = lobby?.findPlayerByReconnectKey(reconnectKey)
      return lobby && player ? { lobby, player } : null
    }

    for (const lobby of this.lobbies.values()) {
      const player = lobby.findPlayerByReconnectKey(reconnectKey)
      if (player) {
        return { lobby, player }
      }
    }

    return null
  }

  removeLobby(code: string): void {
    const normalizedCode = code.trim().toUpperCase()
    const lobby = this.lobbies.get(normalizedCode)
    if (!lobby) return

    lobby.getPlayers().forEach(player => {
      this.playerLobbies.delete(player.id)
    })

    this.lobbies.delete(normalizedCode)
  }

  removePlayer(playerId: string): void {
    const code = this.playerLobbies.get(playerId)
    if (!code) return

    const lobby = this.lobbies.get(code)
    if (!lobby) {
      this.playerLobbies.delete(playerId)
      return
    }

    lobby.removePlayer(playerId)
    this.playerLobbies.delete(playerId)

    if (lobby.getPlayers().length === 0) {
      this.lobbies.delete(code)
    }
  }

  getAllLobbies(): WavvelengthLobby[] {
    return Array.from(this.lobbies.values())
  }
}
