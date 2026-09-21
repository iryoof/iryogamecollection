import { Server as SocketIOServer, Socket } from 'socket.io'
import { GameManager } from './game/GameManager'
import { Lobby } from './game/Lobby'

// Window within which a disconnected player may reconnect before being
// evicted. Only applies while the lobby is still in the waiting room — during
// a running game the seat is held indefinitely, see keepsSeatIndefinitely().
const RECONNECT_GRACE_MS = 60_000

// Map of playerId -> pending eviction timer. Stored at module scope so all
// sockets (reconnects) can find & cancel a timer that belongs to a prior
// session of the same player.
const evictionTimers = new Map<string, NodeJS.Timeout>()

function cancelEviction(playerId: string) {
  const timer = evictionTimers.get(playerId)
  if (timer) {
    clearTimeout(timer)
    evictionTimers.delete(playerId)
  }
}

function scheduleEviction(
  io: SocketIOServer,
  gameManager: GameManager,
  lobby: Lobby,
  playerId: string
) {
  cancelEviction(playerId)
  const code = lobby.getCode()
  const timer = setTimeout(() => {
    evictionTimers.delete(playerId)
    const current = gameManager.findLobbyByPlayerId(playerId)
    if (!current || current.getCode() !== code) return
    if (!current.isDisconnected(playerId)) return
    // removePlayer migrates host internally if the evicted player was host.
    gameManager.removePlayer(playerId)
    const remaining = gameManager.findLobbyByCode(code)
    if (!remaining) return
    io.to(code).emit('state-update', remaining.getState())
    finalizeIfPhaseComplete(io, gameManager, remaining)
    console.log(`Evicted ${playerId} from ${code} after reconnect grace period`)
  }, RECONNECT_GRACE_MS)
  evictionTimers.set(playerId, timer)
}

/**
 * While a game is running, a dropped player keeps their seat for as long as the
 * game lasts: evicting them mid-match would destroy their sheet and leave the
 * round stuck for everybody else. In the waiting room the grace window still
 * applies, otherwise closed tabs would pile up as ghost players forever.
 */
function keepsSeatIndefinitely(lobby: Lobby): boolean {
  const state = lobby.getState()
  return state.gameStarted && !state.gameEnded
}

/**
 * After a player is removed from a lobby (eviction, kick, leave), the round or
 * voting phase may already be complete because the remaining players had
 * already submitted/voted. Without this helper, the round-complete /
 * voting-complete signals would never fire and the game would be stuck on
 * "Warte auf die anderen Spieler...".
 */
function finalizeIfPhaseComplete(
  io: SocketIOServer,
  gameManager: GameManager,
  lobby: Lobby
) {
  const code = lobby.getCode()
  const state = lobby.getState()
  if (state.players.length === 0) return

  if (state.votingActive) {
    if (!lobby.haveAllPlayersVoted()) return
    const archive = lobby.getOrCreatePendingArchive()
    const results = lobby.getVotingResults()
    io.to(code).emit('voting-complete', archive, results)
    gameManager.storeArchive(archive, code)
    return
  }

  if (state.gameStarted && !state.gameEnded) {
    // The removed player may have been the only one not yet submitted.
    // If their absence now satisfies haveAllPlayersSubmitted(), emit the
    // round-complete signal so the surviving players advance instead of
    // being stuck on "Warte auf die anderen Spieler...". Frontend's
    // round-complete handler is idempotent, so a redundant emit (e.g. when
    // submit-text already fired this round) is harmless.
    if (!lobby.haveAllPlayersSubmitted()) return
    const snapshot = lobby.buildArchiveSnapshot()
    io.to(code).emit('round-archived', snapshot)
    gameManager.saveArchiveSnapshot(snapshot)
    io.to(code).emit('round-complete', state.currentRound)
  }
}

export function setupSocketHandlers(io: SocketIOServer, gameManager: GameManager) {
  io.on('connection', (socket: Socket) => {
    console.log(`Client connected: ${socket.id}`)
    socket.join(socket.id)

    // Join Lobby
    socket.on('join-lobby', (code: string, nickname: string, playerId?: string) => {
      try {
        const clientId = playerId || socket.id
        socket.data.playerId = clientId
        socket.join(clientId)
        const lobby = gameManager.joinLobby(clientId, code, nickname)
        socket.join(lobby.getCode())
        // If the player was in the reconnect grace window, cancel their pending
        // eviction and clear the disconnect marker so other clients stop
        // showing them as "getrennt".
        cancelEviction(clientId)
        lobby.markReconnected(clientId)
        socket.emit('lobby-joined', lobby.getState())
        io.to(lobby.getCode()).emit('state-update', lobby.getState())
        console.log(`${nickname} joined lobby ${code}`)
      } catch (error: any) {
        socket.emit('error', error.message)
      }
    })

    // Create Lobby
    socket.on('create-lobby', (settings: any, nickname: string, playerId?: string) => {
      try {
        const clientId = playerId || socket.id
        socket.data.playerId = clientId
        socket.join(clientId)
        const lobby = gameManager.createLobby(clientId, nickname, settings)
        const code = lobby.getCode()
        socket.join(code)
        socket.emit('lobby-created', code, lobby.getState())
        console.log(`New lobby created: ${code}`)
      } catch (error: any) {
        socket.emit('error', error.message)
      }
    })

    // Request current state (for late joiners / page transitions)
    socket.on('request-state', () => {
      try {
        const playerId = socket.data.playerId || socket.id
        const lobby = gameManager.findLobbyByPlayerId(playerId)
        if (!lobby) throw new Error('Lobby not found')

        const state = lobby.getState()
        socket.emit('state-update', state)
        if (state.votingActive) {
          socket.emit('voting-started', lobby.getPendingArchive()?.finalTexts || [])
        } else if (state.roundComplete) {
          socket.emit('round-complete', state.currentRound)
        } else if (state.gameStarted && !state.gameEnded && !lobby.hasPlayerSubmitted(playerId)) {
          const prompt = lobby.getPromptForPlayer(playerId)
          socket.emit('round-started', state.currentRound, prompt)
        }
      } catch (error: any) {
        socket.emit('error', error.message)
      }
    })

    // Submit Text
    socket.on('submit-text', (text: string) => {
      try {
        const playerId = socket.data.playerId || socket.id
        const lobby = gameManager.findLobbyByPlayerId(playerId)
        if (!lobby) throw new Error('Lobby not found')

        lobby.submitText(playerId, text)
        io.to(lobby.getCode()).emit('state-update', lobby.getState())

        if (lobby.haveAllPlayersSubmitted()) {
          const snapshot = lobby.buildArchiveSnapshot()
          io.to(lobby.getCode()).emit('round-archived', snapshot)
          gameManager.saveArchiveSnapshot(snapshot)
          io.to(lobby.getCode()).emit('round-complete', lobby.getState().currentRound)
        }
      } catch (error: any) {
        socket.emit('error', error.message)
      }
    })

    // Leave Lobby. Hosts are allowed to leave too — host role is transferred
    // to the next player in order. If the host is the last player, the lobby
    // is removed. `close-lobby` remains the explicit "shut everything down"
    // action.
    socket.on('leave-lobby', () => {
      try {
        const playerId = socket.data.playerId || socket.id
        const lobby = gameManager.findLobbyByPlayerId(playerId)
        if (!lobby) throw new Error('Lobby not found')

        const code = lobby.getCode()
        const wasLastPlayer = lobby.getPlayerCount() <= 1

        cancelEviction(playerId)
        // removePlayer migrates host internally if the leaving player was host.
        gameManager.removePlayer(playerId)
        socket.leave(code)
        socket.leave(playerId)

        if (wasLastPlayer) {
          // Lobby was removed by removePlayer because it became empty; nothing
          // else to broadcast.
          return
        }

        const remaining = gameManager.findLobbyByCode(code)
        if (!remaining) return
        io.to(code).emit('state-update', remaining.getState())
        finalizeIfPhaseComplete(io, gameManager, remaining)
      } catch (error: any) {
        socket.emit('error', error.message)
      }
    })

    // Close Lobby (host)
    socket.on('close-lobby', () => {
      try {
        const playerId = socket.data.playerId || socket.id
        const lobby = gameManager.findLobbyByPlayerId(playerId)
        if (!lobby) throw new Error('Lobby not found')
        if (lobby.getHostId() !== playerId) {
          throw new Error('Nur der Host kann die Lobby schließen')
        }

        const code = lobby.getCode()
        io.to(code).emit('lobby-closed')
        lobby.getPlayers().forEach(p => cancelEviction(p.id))
        gameManager.removeLobby(code)
      } catch (error: any) {
        socket.emit('error', error.message)
      }
    })

    // Kick a specific player (host only).
    socket.on('kick-player', async (targetId: string) => {
      try {
        const playerId = socket.data.playerId || socket.id
        const lobby = gameManager.findLobbyByPlayerId(playerId)
        if (!lobby) throw new Error('Lobby not found')
        if (lobby.getHostId() !== playerId) {
          throw new Error('Nur der Host kann Spieler entfernen')
        }
        if (!targetId || targetId === playerId) {
          throw new Error('Ungültiger Spieler')
        }
        if (!lobby.hasPlayer(targetId)) {
          throw new Error('Spieler nicht in der Lobby')
        }

        const code = lobby.getCode()
        cancelEviction(targetId)
        // Force the target's socket(s) out of the lobby room BEFORE we broadcast
        // the post-kick state so they don't receive a final state-update that
        // would overwrite the 'kicked' handling on the client.
        const targetSockets = await io.in(targetId).fetchSockets()
        for (const s of targetSockets) {
          s.leave(code)
        }
        io.to(targetId).emit('kicked', 'Du wurdest aus der Lobby entfernt.')
        gameManager.removePlayer(targetId)
        const remaining = gameManager.findLobbyByCode(code)
        if (remaining) {
          io.to(code).emit('state-update', remaining.getState())
          finalizeIfPhaseComplete(io, gameManager, remaining)
        }
      } catch (error: any) {
        socket.emit('error', error.message)
      }
    })

    // Transfer host to another player (host only).
    socket.on('transfer-host', (newHostId: string) => {
      try {
        const playerId = socket.data.playerId || socket.id
        const lobby = gameManager.findLobbyByPlayerId(playerId)
        if (!lobby) throw new Error('Lobby not found')
        if (lobby.getHostId() !== playerId) {
          throw new Error('Nur der Host kann die Host-Rolle übertragen')
        }
        if (!newHostId || newHostId === playerId) {
          throw new Error('Ungültiger Spieler')
        }
        if (!lobby.hasPlayer(newHostId)) {
          throw new Error('Spieler nicht in der Lobby')
        }
        lobby.transferHost(newHostId)
        io.to(lobby.getCode()).emit('state-update', lobby.getState())
      } catch (error: any) {
        socket.emit('error', error.message)
      }
    })

    // Ready Check
    socket.on('ready-check', (playerId: string) => {
      try {
        const resolvedId = playerId || socket.data.playerId || socket.id
        const lobby = gameManager.findLobbyByPlayerId(resolvedId)
        if (!lobby) throw new Error('Lobby not found')

        lobby.setPlayerReady(resolvedId)
        const allReady = lobby.getAllPlayersReady()

        io.to(lobby.getCode()).emit('state-update', lobby.getState())

        if (allReady) {
          io.to(lobby.getCode()).emit('round-complete', lobby.getState().currentRound)
        }
      } catch (error: any) {
        socket.emit('error', error.message)
      }
    })

    // Start Game
    socket.on('start-game', () => {
      try {
        const playerId = socket.data.playerId || socket.id
        const lobby = gameManager.findLobbyByPlayerId(playerId)
        if (!lobby) throw new Error('Lobby not found')
        if (lobby.getHostId() !== playerId) {
          throw new Error('Nur der Host kann das Spiel starten')
        }

        lobby.startGame()
        io.to(lobby.getCode()).emit('state-update', lobby.getState())

        lobby.getPlayers().forEach(player => {
          const prompt = lobby.getPromptForPlayer(player.id)
          io.to(player.id).emit('round-started', lobby.getState().currentRound, prompt)
        })

        console.log(`Game started: ${lobby.getCode()}`)
      } catch (error: any) {
        socket.emit('error', error.message)
      }
    })

    // Next Round
    socket.on('next-round', () => {
      try {
        const playerId = socket.data.playerId || socket.id
        const lobby = gameManager.findLobbyByPlayerId(playerId)
        if (!lobby) throw new Error('Lobby not found')
        if (lobby.getHostId() !== playerId) {
          throw new Error('Nur der Host kann die naechste Runde starten')
        }

        lobby.nextRound()
        io.to(lobby.getCode()).emit('state-update', lobby.getState())
        lobby.getPlayers().forEach(player => {
          const prompt = lobby.getPromptForPlayer(player.id)
          io.to(player.id).emit('round-started', lobby.getState().currentRound, prompt)
        })
      } catch (error: any) {
        socket.emit('error', error.message)
      }
    })

    // End Game
    socket.on('end-game', () => {
      try {
        const playerId = socket.data.playerId || socket.id
        const lobby = gameManager.findLobbyByPlayerId(playerId)
        if (!lobby) throw new Error('Lobby not found')
        if (lobby.getHostId() !== playerId) {
          throw new Error('Nur der Host kann das Spiel beenden')
        }

        const options = lobby.startVoting()
        io.to(lobby.getCode()).emit('state-update', lobby.getState())
        io.to(lobby.getCode()).emit('voting-started', options)
      } catch (error: any) {
        socket.emit('error', error.message)
      }
    })

    // Submit Vote
    socket.on('submit-vote', (textIndex: number) => {
      try {
        const playerId = socket.data.playerId || socket.id
        const lobby = gameManager.findLobbyByPlayerId(playerId)
        if (!lobby) throw new Error('Lobby not found')

        lobby.submitVote(playerId, textIndex)
        io.to(lobby.getCode()).emit('state-update', lobby.getState())

        if (lobby.haveAllPlayersVoted()) {
          const results = lobby.getVotingResults()
          const archive = lobby.getPendingArchive()
          if (!archive) throw new Error('Archive failed')
          io.to(lobby.getCode()).emit('voting-complete', archive, results)
          gameManager.storeArchive(archive, lobby.getCode())
        }
      } catch (error: any) {
        socket.emit('error', error.message)
      }
    })

    // Skip Voting (host)
    socket.on('skip-voting', () => {
      try {
        const playerId = socket.data.playerId || socket.id
        const lobby = gameManager.findLobbyByPlayerId(playerId)
        if (!lobby) throw new Error('Lobby not found')
        if (lobby.getHostId() !== playerId) {
          throw new Error('Nur der Host kann das Voting überspringen')
        }

        const archive = lobby.getOrCreatePendingArchive()
        const results = lobby.getVotingResults()
        io.to(lobby.getCode()).emit('voting-complete', archive, results)
        gameManager.storeArchive(archive, lobby.getCode())
      } catch (error: any) {
        socket.emit('error', error.message)
      }
    })

    // Disconnect: in the waiting room, start the reconnect grace window — if
    // the player does not come back within RECONNECT_GRACE_MS they are evicted
    // (and host is transferred if needed). During a running game no eviction is
    // scheduled at all, so they can rejoin whenever they want.
    socket.on('disconnect', () => {
      console.log(`Client disconnected: ${socket.id}`)
      const playerId = socket.data.playerId
      if (!playerId) return
      const lobby = gameManager.findLobbyByPlayerId(playerId)
      if (!lobby) return
      // Only mark as disconnected if no other live socket exists for this
      // player id (e.g. another tab of the same browser window could share
      // the id across sockets if the user uses the same session storage —
      // although the sessionStorage fix means this should no longer happen
      // for distinct tabs, we still guard to avoid spurious evictions).
      const room = io.sockets.adapter.rooms.get(playerId)
      if (room && room.size > 0) return

      const keepSeat = keepsSeatIndefinitely(lobby)
      if (!lobby.markDisconnected(playerId, keepSeat ? 0 : RECONNECT_GRACE_MS)) return
      if (keepSeat) {
        cancelEviction(playerId)
      } else {
        scheduleEviction(io, gameManager, lobby, playerId)
      }
      io.to(lobby.getCode()).emit('state-update', lobby.getState())
    })

    socket.on('error', (error) => {
      console.error('Socket error:', error)
    })
  })
}
