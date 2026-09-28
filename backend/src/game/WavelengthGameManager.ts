import { WavelengthLobby, WavelengthPlayer } from './WavelengthLobby'
import { generateLobbyCode } from '../utils/codeGenerator'

/**
 * Wie lange eine leer gewordene Lobby noch aufgehoben wird. Wurde sie sofort
 * geloescht, war der Code tot, sobald allen gleichzeitig die Verbindung abriss.
 */
const EMPTY_LOBBY_TTL_MS = 15 * 60_000

export class WavelengthGameManager {
  private lobbies: Map<string, WavelengthLobby> = new Map()
  private playerLobbies: Map<string, string> = new Map()
  private emptyLobbyTimers: Map<string, NodeJS.Timeout> = new Map()

  private cancelEmptyLobbyTimer(code: string): void {
    const timer = this.emptyLobbyTimers.get(code)
    if (!timer) return
    clearTimeout(timer)
    this.emptyLobbyTimers.delete(code)
  }

  private scheduleEmptyLobbyRemoval(code: string): void {
    this.cancelEmptyLobbyTimer(code)
    const timer = setTimeout(() => {
      this.emptyLobbyTimers.delete(code)
      const lobby = this.lobbies.get(code)
      // Inzwischen kann jemand zurueckgekommen sein.
      if (!lobby || lobby.getPlayers().length > 0) return
      this.lobbies.delete(code)
      console.log(`Leere Wavelength-Lobby ${code} nach Frist entfernt`)
    }, EMPTY_LOBBY_TTL_MS)
    this.emptyLobbyTimers.set(code, timer)
  }

  createLobby(hostId: string, hostName: string): WavelengthLobby {
    let code = generateLobbyCode()
    while (this.lobbies.has(code)) {
      code = generateLobbyCode()
    }

    const lobby = new WavelengthLobby(code, hostId, hostName)
    this.lobbies.set(code, lobby)
    this.playerLobbies.set(hostId, code)

    console.log(`Wavelength lobby created: ${code}`)
    return lobby
  }

  joinLobby(
    playerId: string,
    code: string,
    playerName: string,
    waitForNextRound = false
  ): WavelengthLobby {
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

    // Zurueckgekommen, bevor die Frist ablief.
    this.cancelEmptyLobbyTimer(normalizedCode)
    const lobbyWasEmpty = lobby.getPlayers().length === 0

    lobby.addPlayer(playerId, playerName, waitForNextRound)
    // Sonst gehoerte die Lobby einem Host, den es nicht mehr gibt.
    if (lobbyWasEmpty) {
      lobby.adoptEmptyLobby(playerId)
    }
    this.playerLobbies.set(playerId, normalizedCode)

    console.log(`Player ${playerName} joined Wavelength lobby ${normalizedCode}`)
    return lobby
  }

  findLobbyByPlayerId(playerId: string): WavelengthLobby | null {
    const code = this.playerLobbies.get(playerId)
    if (!code) return null
    return this.lobbies.get(code) || null
  }

  findLobbyByCode(code: string): WavelengthLobby | null {
    return this.lobbies.get(code.trim().toUpperCase()) || null
  }

  findPlayerByReconnectKey(reconnectKey: string, code?: string): { lobby: WavelengthLobby; player: WavelengthPlayer } | null {
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
    this.cancelEmptyLobbyTimer(code)
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

    // Leere Lobby nicht sofort wegwerfen - siehe EMPTY_LOBBY_TTL_MS.
    if (lobby.getPlayers().length === 0) {
      this.scheduleEmptyLobbyRemoval(code)
    }
  }

  getAllLobbies(): WavelengthLobby[] {
    return Array.from(this.lobbies.values())
  }
}
