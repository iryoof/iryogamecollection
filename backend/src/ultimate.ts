import { randomUUID } from 'node:crypto'
import { Server as SocketIOServer, Socket } from 'socket.io'
import { UltimateGameManager } from './game/UltimateGameManager'
import { UltimateLobby, UltimatePlayer } from './game/UltimateLobby'
import { MatchMode } from './game/UltimateMatch'

// Gleiche Frist wie bei Wavelength: ein Kaltstart der Render-Instanz dauert
// rund 50 Sekunden, in denen niemand verbinden kann. Zwei Minuten waren dafuer
// zu knapp.
const RECONNECT_GRACE_MS = 5 * 60_000

const ultimateGameManager = new UltimateGameManager()
const evictionTimers = new Map<string, NodeJS.Timeout>()

interface UltimateSession {
  playerId: string
  reconnectKey: string
  lobbyCode: string
  playerName: string
  reconnectDeadline: number | null
}

interface UltimateAck {
  ok?: boolean
  code?: string
  error?: string
  session?: UltimateSession
}

function cancelEviction(playerId: string): void {
  const timer = evictionTimers.get(playerId)
  if (!timer) return
  clearTimeout(timer)
  evictionTimers.delete(playerId)
}

function buildSession(lobby: UltimateLobby, player: UltimatePlayer): UltimateSession {
  return {
    playerId: player.id,
    reconnectKey: player.reconnectKey,
    lobbyCode: lobby.getCode(),
    playerName: player.name,
    reconnectDeadline: player.reconnectDeadline
  }
}

function attachSocketToPlayer(socket: Socket, lobby: UltimateLobby, player: UltimatePlayer): void {
  socket.data.ultimatePlayerId = player.id
  socket.data.ultimateReconnectKey = player.reconnectKey
  socket.join(player.id)
  socket.join(lobby.getCode())
}

/**
 * Ein einziger Broadcast je Aenderung. Anders als bei Wavelength gibt es hier
 * keine verdeckte Information — alle sehen dasselbe Brett, also braucht
 * niemand einen eigenen Zuschnitt des Zustands.
 */
function broadcast(io: SocketIOServer, lobby: UltimateLobby): void {
  io.to(lobby.getCode()).emit('ttt:state', lobby.getState())
}

function scheduleEviction(io: SocketIOServer, playerId: string): void {
  cancelEviction(playerId)

  const timer = setTimeout(() => {
    evictionTimers.delete(playerId)
    const lobby = ultimateGameManager.findLobbyByPlayerId(playerId)
    if (!lobby) return
    if (!lobby.isDisconnected(playerId)) return

    const code = lobby.getCode()
    ultimateGameManager.removePlayer(playerId)

    const remaining = ultimateGameManager.findLobbyByCode(code)
    if (remaining) broadcast(io, remaining)
  }, RECONNECT_GRACE_MS)

  evictionTimers.set(playerId, timer)
}

function isMatchMode(value: unknown): value is MatchMode {
  return value === '1v1' || value === '2v2'
}

/** Fehlerschluessel der Engine in etwas, das am Tisch verstanden wird. */
function describeMoveError(error: string): string {
  switch (error) {
    case 'not-playing': return 'Es läuft gerade keine Partie.'
    case 'no-seat': return 'Du sitzt nicht mit am Tisch.'
    case 'match-finished': return 'Die Partie ist vorbei.'
    case 'no-such-board': return 'Dieses Brett gibt es nicht.'
    case 'no-such-seat': return 'Diesen Platz gibt es nicht.'
    case 'board-finished': return 'Dieses Brett ist bereits entschieden.'
    case 'already-moved-this-round': return 'An diesem Brett wurde in dieser Runde schon gezogen.'
    case 'not-your-turn': return 'Du bist hier gerade nicht an der Reihe.'
    case 'wrong-sub': return 'Du musst in das vorgegebene Feld setzen.'
    case 'sub-closed': return 'Dieses Feld ist bereits entschieden.'
    case 'cell-taken': return 'Diese Zelle ist schon belegt.'
    case 'out-of-range': return 'Ungültiger Zug.'
    default: return 'Zug nicht möglich.'
  }
}

export function setupUltimateSocketHandlers(io: SocketIOServer): void {
  io.on('connection', (socket: Socket) => {
    const currentLobby = (): UltimateLobby | null => {
      const playerId = socket.data.ultimatePlayerId as string | undefined
      if (!playerId) return null
      return ultimateGameManager.findLobbyByPlayerId(playerId)
    }

    socket.on('ttt:lobby:create', (nickname: string, callback?: (response: UltimateAck) => void) => {
      try {
        const trimmedName = nickname?.trim()
        if (!trimmedName) {
          callback?.({ error: 'Name darf nicht leer sein.' })
          return
        }

        const playerId = randomUUID()
        const lobby = ultimateGameManager.createLobby(playerId, trimmedName)
        const player = lobby.getPlayer(playerId)
        if (!player) {
          callback?.({ error: 'Host konnte nicht erstellt werden.' })
          return
        }

        // Der Host nimmt Platz 0 (A). Sonst steht die Lobby mit lauter freien
        // Plaetzen da und niemand weiss, dass man sich setzen muss.
        lobby.takeSeat(playerId, 0)

        cancelEviction(playerId)
        attachSocketToPlayer(socket, lobby, player)
        callback?.({ ok: true, code: lobby.getCode(), session: buildSession(lobby, player) })
        broadcast(io, lobby)
      } catch (error: any) {
        callback?.({ error: error.message })
      }
    })

    socket.on('ttt:lobby:join', (code: string, nickname: string, callback?: (response: UltimateAck) => void) => {
      try {
        const trimmedName = nickname?.trim()
        const normalizedCode = code?.trim().toUpperCase()
        if (!trimmedName) {
          callback?.({ error: 'Name darf nicht leer sein.' })
          return
        }
        if (!normalizedCode) {
          callback?.({ error: 'Lobby-Code fehlt.' })
          return
        }

        const playerId = randomUUID()
        const lobby = ultimateGameManager.joinLobby(playerId, normalizedCode, trimmedName)
        const player = lobby.getPlayer(playerId)
        if (!player) {
          callback?.({ error: 'Beitritt fehlgeschlagen.' })
          return
        }

        // Auf den ersten freien Platz setzen, solange die Lobby wartet. Wer
        // lieber woanders sitzt, klickt um; wer zu spaet kommt, bleibt
        // Zuschauer.
        if (lobby.getPhase() === 'waiting') {
          const freeSeat = lobby.getSeats().findIndex(seat => seat === null)
          if (freeSeat >= 0) lobby.takeSeat(playerId, freeSeat)
        }

        cancelEviction(playerId)
        attachSocketToPlayer(socket, lobby, player)
        callback?.({ ok: true, code: lobby.getCode(), session: buildSession(lobby, player) })
        broadcast(io, lobby)
      } catch (error: any) {
        callback?.({ error: error.message })
      }
    })

    socket.on('ttt:session:resume', (reconnectKey: string, code: string, callback?: (response: UltimateAck) => void) => {
      try {
        if (!reconnectKey || typeof reconnectKey !== 'string') {
          callback?.({ error: 'Reconnect-Schlüssel fehlt.' })
          return
        }

        const found = ultimateGameManager.findPlayerByReconnectKey(reconnectKey, code)
        if (!found) {
          callback?.({ error: 'Reconnect-Fenster abgelaufen oder Session ungültig.' })
          return
        }

        const { lobby, player } = found
        if (player.reconnectDeadline && player.reconnectDeadline <= Date.now()) {
          const lobbyCode = lobby.getCode()
          ultimateGameManager.removePlayer(player.id)
          const remaining = ultimateGameManager.findLobbyByCode(lobbyCode)
          if (remaining) broadcast(io, remaining)
          callback?.({ error: 'Reconnect-Fenster abgelaufen.' })
          return
        }

        cancelEviction(player.id)
        lobby.markConnected(player.id)
        attachSocketToPlayer(socket, lobby, player)
        callback?.({ ok: true, code: lobby.getCode(), session: buildSession(lobby, player) })
        broadcast(io, lobby)
      } catch (error: any) {
        callback?.({ error: error.message })
      }
    })

    socket.on('ttt:lobby:mode', (mode: string, callback?: (response: UltimateAck) => void) => {
      try {
        const lobby = currentLobby()
        const playerId = socket.data.ultimatePlayerId as string | undefined
        if (!lobby || !playerId) {
          callback?.({ error: 'Du bist in keiner Lobby.' })
          return
        }
        if (lobby.getHostId() !== playerId) {
          callback?.({ error: 'Nur der Host kann den Modus wechseln.' })
          return
        }
        if (!isMatchMode(mode)) {
          callback?.({ error: 'Unbekannter Modus.' })
          return
        }
        if (!lobby.setMode(mode)) {
          callback?.({ error: 'Der Modus lässt sich nur im Warteraum wechseln.' })
          return
        }

        // Der Wechsel auf 2v2 schafft zwei neue Plaetze. Wer bisher zusehen
        // musste, weil nur zwei Plaetze da waren, rutscht automatisch nach —
        // sonst steht die Lobby mit zwei freien Plaetzen und zwei Zuschauern
        // da und niemand merkt, dass er sich setzen muss.
        lobby.getPlayers()
          .filter(player => player.seat === null)
          .forEach(player => {
            const free = lobby.getSeats().findIndex(seat => seat === null)
            if (free >= 0) lobby.takeSeat(player.id, free)
          })

        callback?.({ ok: true })
        broadcast(io, lobby)
      } catch (error: any) {
        callback?.({ error: error.message })
      }
    })

    socket.on('ttt:lobby:seat', (seat: number | null, callback?: (response: UltimateAck) => void) => {
      try {
        const lobby = currentLobby()
        const playerId = socket.data.ultimatePlayerId as string | undefined
        if (!lobby || !playerId) {
          callback?.({ error: 'Du bist in keiner Lobby.' })
          return
        }
        if (!lobby.takeSeat(playerId, seat)) {
          callback?.({ error: 'Dieser Platz ist nicht frei.' })
          return
        }

        callback?.({ ok: true })
        broadcast(io, lobby)
      } catch (error: any) {
        callback?.({ error: error.message })
      }
    })

    socket.on('ttt:lobby:start', (callback?: (response: UltimateAck) => void) => {
      try {
        const lobby = currentLobby()
        const playerId = socket.data.ultimatePlayerId as string | undefined
        if (!lobby || !playerId) {
          callback?.({ error: 'Du bist in keiner Lobby.' })
          return
        }
        if (lobby.getHostId() !== playerId) {
          callback?.({ error: 'Nur der Host kann starten.' })
          return
        }
        if (!lobby.startGame()) {
          callback?.({ error: 'Es sind noch nicht alle Plätze besetzt.' })
          return
        }

        callback?.({ ok: true })
        broadcast(io, lobby)
      } catch (error: any) {
        callback?.({ error: error.message })
      }
    })

    socket.on('ttt:move', (board: number, sub: number, cell: number, callback?: (response: UltimateAck) => void) => {
      try {
        const lobby = currentLobby()
        const playerId = socket.data.ultimatePlayerId as string | undefined
        if (!lobby || !playerId) {
          callback?.({ error: 'Du bist in keiner Lobby.' })
          return
        }

        const result = lobby.move(playerId, board, { sub, cell })
        if (!result.ok) {
          callback?.({ error: describeMoveError(result.error) })
          return
        }

        callback?.({ ok: true })
        broadcast(io, lobby)
      } catch (error: any) {
        callback?.({ error: error.message })
      }
    })

    socket.on('ttt:play-again', (callback?: (response: UltimateAck) => void) => {
      try {
        const lobby = currentLobby()
        const playerId = socket.data.ultimatePlayerId as string | undefined
        if (!lobby || !playerId) {
          callback?.({ error: 'Du bist in keiner Lobby.' })
          return
        }
        if (lobby.getHostId() !== playerId) {
          callback?.({ error: 'Nur der Host kann eine neue Partie starten.' })
          return
        }
        if (!lobby.playAgain()) {
          callback?.({ error: 'Neue Partie nicht möglich — es fehlt jemand.' })
          broadcast(io, lobby)
          return
        }

        callback?.({ ok: true })
        broadcast(io, lobby)
      } catch (error: any) {
        callback?.({ error: error.message })
      }
    })

    socket.on('ttt:lobby:back', (callback?: (response: UltimateAck) => void) => {
      try {
        const lobby = currentLobby()
        const playerId = socket.data.ultimatePlayerId as string | undefined
        if (!lobby || !playerId) {
          callback?.({ error: 'Du bist in keiner Lobby.' })
          return
        }
        if (lobby.getHostId() !== playerId) {
          callback?.({ error: 'Nur der Host kann zurück in den Warteraum.' })
          return
        }

        lobby.returnToLobby()
        callback?.({ ok: true })
        broadcast(io, lobby)
      } catch (error: any) {
        callback?.({ error: error.message })
      }
    })

    socket.on('ttt:lobby:kick', (targetId: string, callback?: (response: UltimateAck) => void) => {
      try {
        const lobby = currentLobby()
        const playerId = socket.data.ultimatePlayerId as string | undefined
        if (!lobby || !playerId) {
          callback?.({ error: 'Du bist in keiner Lobby.' })
          return
        }
        if (lobby.getHostId() !== playerId) {
          callback?.({ error: 'Nur der Host kann jemanden entfernen.' })
          return
        }
        if (targetId === playerId) {
          callback?.({ error: 'Dich selbst kannst du nicht entfernen.' })
          return
        }
        if (!lobby.hasPlayer(targetId)) {
          callback?.({ error: 'Diesen Spieler gibt es hier nicht.' })
          return
        }

        const code = lobby.getCode()
        io.to(targetId).emit('ttt:lobby:kicked', 'Der Host hat dich entfernt.')
        cancelEviction(targetId)
        ultimateGameManager.removePlayer(targetId)

        callback?.({ ok: true })
        const remaining = ultimateGameManager.findLobbyByCode(code)
        if (remaining) broadcast(io, remaining)
      } catch (error: any) {
        callback?.({ error: error.message })
      }
    })

    socket.on('ttt:lobby:leave', (callback?: (response: UltimateAck) => void) => {
      try {
        const playerId = socket.data.ultimatePlayerId as string | undefined
        if (!playerId) {
          callback?.({ ok: true })
          return
        }

        const lobby = ultimateGameManager.findLobbyByPlayerId(playerId)
        const code = lobby?.getCode()

        cancelEviction(playerId)
        ultimateGameManager.removePlayer(playerId)
        socket.data.ultimatePlayerId = undefined
        socket.data.ultimateReconnectKey = undefined
        if (code) socket.leave(code)
        socket.leave(playerId)

        callback?.({ ok: true })
        if (code) {
          const remaining = ultimateGameManager.findLobbyByCode(code)
          if (remaining) broadcast(io, remaining)
        }
      } catch (error: any) {
        callback?.({ error: error.message })
      }
    })

    socket.on('ttt:lobby:close', (callback?: (response: UltimateAck) => void) => {
      try {
        const lobby = currentLobby()
        const playerId = socket.data.ultimatePlayerId as string | undefined
        if (!lobby || !playerId) {
          callback?.({ error: 'Du bist in keiner Lobby.' })
          return
        }
        if (lobby.getHostId() !== playerId) {
          callback?.({ error: 'Nur der Host kann die Lobby schließen.' })
          return
        }

        const code = lobby.getCode()
        lobby.getPlayers().forEach(player => cancelEviction(player.id))
        io.to(code).emit('ttt:lobby:closed')
        ultimateGameManager.removeLobby(code)

        callback?.({ ok: true })
      } catch (error: any) {
        callback?.({ error: error.message })
      }
    })

    socket.on('disconnect', () => {
      try {
        const playerId = socket.data.ultimatePlayerId as string | undefined
        if (!playerId) return

        // Ein zweiter Tab desselben Spielers haelt die Verbindung offen.
        const room = io.sockets.adapter.rooms.get(playerId)
        if (room && room.size > 0) return

        const lobby = ultimateGameManager.findLobbyByPlayerId(playerId)
        if (!lobby) return

        // Waehrend einer Partie wird der Platz ohne Frist gehalten: fliegt
        // jemand raus, bricht die Partie ab (siehe UltimateLobby.removePlayer),
        // und das soll nicht wegen einer wackligen Leitung passieren.
        const keepSeat = lobby.getPhase() !== 'waiting'
        lobby.markDisconnected(playerId, keepSeat ? null : Date.now() + RECONNECT_GRACE_MS)
        if (keepSeat) {
          cancelEviction(playerId)
        } else {
          scheduleEviction(io, playerId)
        }

        broadcast(io, lobby)
      } catch (error) {
        console.error('Ultimate disconnect error:', error)
      }
    })
  })
}
