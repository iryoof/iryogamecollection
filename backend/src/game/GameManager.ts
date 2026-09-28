import { Lobby } from './Lobby'
import { GameSettings, GameArchive } from 'shared/types'
import { generateLobbyCode } from '../utils/codeGenerator'

/**
 * Wie lange eine leer gewordene Lobby noch aufgehoben wird.
 *
 * Vorher wurde sie in dem Moment geloescht, in dem der letzte Spieler
 * rausflog — und genau das passiert reihenweise, wenn die Verbindung fuer alle
 * gleichzeitig abreisst (Kaltstart der Instanz, WLAN weg). Der Code war damit
 * tot, und alle sahen beim Zurueckkommen "Lobby not found", obwohl der Server
 * durchgehend lief. Eine Viertelstunde reicht, um wieder hereinzufinden.
 */
const EMPTY_LOBBY_TTL_MS = 15 * 60_000

export class GameManager {
  private lobbies: Map<string, Lobby> = new Map()
  private playerLobbies: Map<string, string> = new Map() // playerId -> lobbyCode
  private archives: GameArchive[] = []
  private totalGamesPlayed: number = 0
  /** Laufende Loeschfristen leerer Lobbys, damit ein Beitritt sie abbrechen kann. */
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
      // In der Zwischenzeit kann jemand zurueckgekommen sein.
      if (!lobby || !lobby.isEmpty()) return
      this.removeLobby(code)
      console.log(`Leere Lobby ${code} nach Frist entfernt`)
    }, EMPTY_LOBBY_TTL_MS)
    this.emptyLobbyTimers.set(code, timer)
  }

  createLobby(hostId: string, hostNickname: string, settings: GameSettings): Lobby {
    let code = generateLobbyCode()
    
    // Make sure code is unique
    while (this.lobbies.has(code)) {
      code = generateLobbyCode()
    }

    const lobby = new Lobby(code, hostId, hostNickname, settings)
    this.lobbies.set(code, lobby)
    this.playerLobbies.set(hostId, code)

    console.log(`✨ Lobby created: ${code}`)
    return lobby
  }

  joinLobby(playerId: string, code: string, nickname: string): Lobby {
    const normalizedCode = code.toUpperCase()
    const existingCode = this.playerLobbies.get(playerId)
    if (existingCode && existingCode !== normalizedCode) {
      throw new Error('Player already in another lobby')
    }

    const lobby = this.lobbies.get(normalizedCode)
    if (!lobby) {
      throw new Error(`Lobby ${code} not found`)
    }

    if (lobby.isLobbyFull()) {
      throw new Error('Lobby is full')
    }

    // Zurueckgekommen, bevor die Frist ablief: Lobby behalten.
    this.cancelEmptyLobbyTimer(normalizedCode)

    if (lobby.hasPlayer(playerId)) {
      lobby.updatePlayerNickname(playerId, nickname)
    } else {
      lobby.addPlayer(playerId, nickname)
    }
    this.playerLobbies.set(playerId, normalizedCode)

    console.log(`📍 Player ${nickname} joined lobby ${code}`)
    return lobby
  }
  findLobbyByPlayerId(playerId: string): Lobby | null {
    const code = this.playerLobbies.get(playerId)
    if (!code) return null
    return this.lobbies.get(code) || null
  }

  findLobbyByCode(code: string): Lobby | null {
    return this.lobbies.get(code.toUpperCase()) || null
  }

  removeLobby(code: string): void {
    this.cancelEmptyLobbyTimer(code)
    const lobby = this.lobbies.get(code)
    if (lobby) {
      lobby.getPlayers().forEach(player => {
        this.playerLobbies.delete(player.id)
      })
      this.lobbies.delete(code)
    }
  }

  removePlayer(playerId: string): void {
    const code = this.playerLobbies.get(playerId)
    if (code) {
      const lobby = this.lobbies.get(code)
      if (lobby) {
        lobby.removePlayer(playerId)

        // Leere Lobby nicht sofort wegwerfen, sondern eine Frist geben - siehe
        // EMPTY_LOBBY_TTL_MS.
        if (lobby.isEmpty()) {
          this.scheduleEmptyLobbyRemoval(code)
        }
      }
    }
    this.playerLobbies.delete(playerId)
  }

  archiveGame(lobbyCode: string): GameArchive | null {
    const lobby = this.lobbies.get(lobbyCode)
    if (!lobby) return null

    const archive = lobby.endGame()
    this.upsertArchive(archive)
    this.totalGamesPlayed++

    this.removeLobby(lobbyCode)
    return archive
  }

  storeArchive(archive: GameArchive, lobbyCode: string): void {
    this.upsertArchive(archive)
    this.totalGamesPlayed++
    this.removeLobby(lobbyCode)
  }

  saveArchiveSnapshot(archive: GameArchive): void {
    this.upsertArchive(archive)
  }

  getArchives(): GameArchive[] {
    return this.archives
  }

  getActiveLobbyCount(): number {
    return this.lobbies.size
  }

  getTotalGamesPlayed(): number {
    return this.totalGamesPlayed
  }

  private upsertArchive(archive: GameArchive): void {
    const index = this.archives.findIndex(item => item.id === archive.id)
    if (index >= 0) {
      this.archives[index] = archive
    } else {
      this.archives.push(archive)
    }
  }
}
