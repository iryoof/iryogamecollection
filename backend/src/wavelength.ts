import { randomUUID } from 'node:crypto'
import { Server as SocketIOServer, Socket } from 'socket.io'
import { WavelengthGameManager } from './game/WavelengthGameManager'
import { WavelengthLobby, WavelengthPlayer } from './game/WavelengthLobby'
import {
  cancelVoteKick,
  castVoteKickVote,
  getVoteKick,
  isVoteKickTarget,
  refreshVoteKick,
  startVoteKick,
  VoteKickOutcome,
  VoteKickState
} from './game/VoteKick'

const RECONNECT_GRACE_MS = 120_000
const wavelengthGameManager = new WavelengthGameManager()
const evictionTimers = new Map<string, NodeJS.Timeout>()

interface WavelengthSession {
  playerId: string
  reconnectKey: string
  lobbyCode: string
  playerName: string
  reconnectDeadline: number | null
}

interface WavelengthAck {
  ok?: boolean
  code?: string
  error?: string
  session?: WavelengthSession
}

function cancelEviction(playerId: string) {
  const timer = evictionTimers.get(playerId)
  if (!timer) return

  clearTimeout(timer)
  evictionTimers.delete(playerId)
}

function buildSession(lobby: WavelengthLobby, player: WavelengthPlayer): WavelengthSession {
  return {
    playerId: player.id,
    reconnectKey: player.reconnectKey,
    lobbyCode: lobby.getCode(),
    playerName: player.name,
    reconnectDeadline: player.reconnectDeadline ?? null
  }
}

function attachSocketToPlayer(socket: Socket, lobby: WavelengthLobby, player: WavelengthPlayer) {
  socket.data.wavelengthPlayerId = player.id
  socket.data.wavelengthReconnectKey = player.reconnectKey
  socket.join(player.id)
  socket.join(lobby.getCode())
}

function buildGameState(lobby: WavelengthLobby, playerId: string) {
  const seekerInfo = lobby.getSeekerInfo()
  const player = lobby.getPlayer(playerId)
  if (!seekerInfo || !player) return null

  const pendingQuestion = lobby.getPendingQuestionForPlayer(playerId)
  const hasAnsweredQuestion = lobby.hasAnsweredQuestion(playerId)

  return {
    state: 'playing' as const,
    players: lobby.getPlayers(),
    seekerId: seekerInfo.seekerId,
    seekerName: lobby.getPlayer(seekerInfo.seekerId)?.name || 'Unknown',
    targetNumber: playerId === seekerInfo.seekerId ? 0 : seekerInfo.number,
    targetNumberHidden: playerId === seekerInfo.seekerId,
    questionsAndAnswers: lobby.getQuestionsAndAnswers(),
    isHost: player.isHost,
    myId: player.id,
    myName: player.name,
    hasAnsweredQuestion,
    canAnswerQuestion: !!pendingQuestion,
    pendingQuestion: pendingQuestion?.question || null,
    canMakeGuess: playerId === seekerInfo.seekerId ? lobby.canSeekerGuess() : false,
    isDisconnected: !!player.isDisconnected,
    reconnectDeadline: player.reconnectDeadline ?? null
  }
}

function buildResultState(lobby: WavelengthLobby, playerId: string) {
  const seekerInfo = lobby.getSeekerInfo()
  const result = lobby.getResult()
  const player = lobby.getPlayer(playerId)
  if (!seekerInfo || !result || !player) return null

  return {
    state: 'result' as const,
    players: lobby.getPlayers(),
    seekerId: seekerInfo.seekerId,
    seekerName: lobby.getPlayer(seekerInfo.seekerId)?.name || 'Unknown',
    targetNumber: result.targetNumber,
    targetNumberHidden: false,
    questionsAndAnswers: lobby.getQuestionsAndAnswers(),
    seekerGuess: result.guess,
    isCorrect: result.correct,
    isHost: player.isHost,
    myId: player.id,
    myName: player.name,
    hasAnsweredQuestion: lobby.hasAnsweredQuestion(player.id),
    canAnswerQuestion: false,
    pendingQuestion: null,
    canMakeGuess: false,
    isDisconnected: !!player.isDisconnected,
    reconnectDeadline: player.reconnectDeadline ?? null
  }
}

function broadcastLobbyState(io: SocketIOServer, lobby: WavelengthLobby) {
  io.to(lobby.getCode()).emit('wvl:lobby:update', lobby.getState())
}

function broadcastVotingState(io: SocketIOServer, lobby: WavelengthLobby) {
  io.to(lobby.getCode()).emit('wvl:voting:started', lobby.getState())
}

function broadcastGameState(io: SocketIOServer, lobby: WavelengthLobby) {
  lobby.getPlayers().forEach(player => {
    const state = buildGameState(lobby, player.id)
    if (state) {
      io.to(player.id).emit('wvl:game:state', state)
    }
  })
}

function broadcastResultState(io: SocketIOServer, lobby: WavelengthLobby) {
  lobby.getPlayers().forEach(player => {
    const state = buildResultState(lobby, player.id)
    if (state) {
      io.to(player.id).emit('wvl:result:state', state)
    }
  })
}

function broadcastCurrentState(io: SocketIOServer, lobby: WavelengthLobby) {
  switch (lobby.getPhase()) {
    case 'waiting':
      broadcastLobbyState(io, lobby)
      break
    case 'voting':
      broadcastVotingState(io, lobby)
      break
    case 'playing':
      broadcastGameState(io, lobby)
      break
    case 'result':
      broadcastResultState(io, lobby)
      break
  }
}

function advanceVotingIfReady(io: SocketIOServer, lobby: WavelengthLobby) {
  if (!lobby.haveAllPlayersVoted()) {
    broadcastVotingState(io, lobby)
    return
  }

  lobby.determineSeekerAndNumber()
  lobby.startGame()
  broadcastGameState(io, lobby)
}

function handleRosterChange(io: SocketIOServer, lobby: WavelengthLobby) {
  if (lobby.getPlayers().length === 0) return

  if (lobby.getPhase() === 'voting' && lobby.haveAllPlayersVoted()) {
    advanceVotingIfReady(io, lobby)
    return
  }

  broadcastCurrentState(io, lobby)
}

/**
 * Remove a player and tell them why. Shared by the host kick and the vote kick.
 */
async function evictPlayer(
  io: SocketIOServer,
  code: string,
  targetId: string,
  reason: string
): Promise<void> {
  cancelEviction(targetId)

  // Take the target out of the lobby room before the roster broadcast, so a
  // late state update cannot arrive after 'wvl:lobby:kicked' and put the kicked
  // client back on the lobby screen. The per-player room stays joined until
  // after the emit, otherwise the notice would go nowhere.
  const targetSockets = await io.in(targetId).fetchSockets()
  for (const targetSocket of targetSockets) {
    targetSocket.leave(code)
  }
  io.to(targetId).emit('wvl:lobby:kicked', reason)

  wavelengthGameManager.removePlayer(targetId)
  const remainingLobby = wavelengthGameManager.findLobbyByCode(code)
  if (!remainingLobby) {
    cancelVoteKick(code)
    return
  }
  // Cancel an open vote only if it was about the player who just left; for
  // anyone else the tally merely has one voter fewer.
  refreshVoteKick(code, !isVoteKickTarget(code, targetId))
  handleRosterChange(io, remainingLobby)
}

/** Connected players who may vote on kicking `targetId`. */
function voteKickEligibleIds(code: string, targetId: string): string[] {
  const lobby = wavelengthGameManager.findLobbyByCode(code)
  if (!lobby) return []
  return lobby
    .getPlayers()
    .filter(player => player.id !== targetId && !player.isDisconnected)
    .map(player => player.id)
}

function handleVoteKickChange(io: SocketIOServer, code: string, targetId: string, targetName: string) {
  return (state: VoteKickState | null, outcome: VoteKickOutcome | null) => {
    io.to(code).emit('wvl:votekick:state', state)
    if (!outcome) return

    io.to(code).emit('wvl:votekick:result', { targetName, outcome })
    if (outcome !== 'passed') return

    void evictPlayer(io, code, targetId, 'Die Lobby hat dich per Abstimmung entfernt.')
  }
}

function scheduleEviction(io: SocketIOServer, playerId: string) {
  cancelEviction(playerId)
  const timer = setTimeout(() => {
    evictionTimers.delete(playerId)

    const lobby = wavelengthGameManager.findLobbyByPlayerId(playerId)
    if (!lobby || !lobby.isDisconnected(playerId)) return

    const code = lobby.getCode()
    wavelengthGameManager.removePlayer(playerId)
    const remainingLobby = wavelengthGameManager.findLobbyByCode(code)
    if (remainingLobby) {
      handleRosterChange(io, remainingLobby)
    }
  }, RECONNECT_GRACE_MS)

  evictionTimers.set(playerId, timer)
}

export function setupWavelengthSocketHandlers(io: SocketIOServer) {
  io.on('connection', (socket: Socket) => {
    socket.on('wvl:lobby:create', (nickname: string, callback?: (response: WavelengthAck) => void) => {
      try {
        const trimmedName = nickname?.trim()
        if (!trimmedName) {
          callback?.({ error: 'Name darf nicht leer sein.' })
          return
        }

        const playerId = randomUUID()
        const lobby = wavelengthGameManager.createLobby(playerId, trimmedName)
        const player = lobby.getPlayer(playerId)
        if (!player) {
          callback?.({ error: 'Host konnte nicht erstellt werden.' })
          return
        }

        cancelEviction(player.id)
        attachSocketToPlayer(socket, lobby, player)
        callback?.({ ok: true, code: lobby.getCode(), session: buildSession(lobby, player) })
        broadcastLobbyState(io, lobby)
      } catch (error: any) {
        callback?.({ error: error.message })
      }
    })

    socket.on('wvl:lobby:join', (code: string, nickname: string, callback?: (response: WavelengthAck) => void) => {
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

        const existingLobby = wavelengthGameManager.findLobbyByCode(normalizedCode)
        if (!existingLobby) {
          callback?.({ error: 'Lobby nicht gefunden.' })
          return
        }
        // Joining a running lobby is allowed; the newcomer sits out the current
        // round and is let in when the next one starts.
        const waitForNextRound = existingLobby.getPhase() !== 'waiting'

        const playerId = randomUUID()
        const lobby = wavelengthGameManager.joinLobby(
          playerId,
          normalizedCode,
          trimmedName,
          waitForNextRound
        )
        const player = lobby.getPlayer(playerId)
        if (!player) {
          callback?.({ error: 'Spieler konnte nicht beitreten.' })
          return
        }

        cancelEviction(player.id)
        attachSocketToPlayer(socket, lobby, player)
        callback?.({ ok: true, code: lobby.getCode(), session: buildSession(lobby, player) })
        broadcastCurrentState(io, lobby)
      } catch (error: any) {
        callback?.({ error: error.message === 'Name already taken' ? 'Dieser Name ist bereits vergeben.' : error.message })
      }
    })

    socket.on('wvl:session:resume', (reconnectKey: string, code: string, callback?: (response: WavelengthAck) => void) => {
      try {
        if (!reconnectKey || typeof reconnectKey !== 'string') {
          callback?.({ error: 'Reconnect-Schlüssel fehlt.' })
          return
        }

        const match = wavelengthGameManager.findPlayerByReconnectKey(reconnectKey, code)
        if (!match) {
          callback?.({ error: 'Reconnect-Fenster abgelaufen oder Session ungültig.' })
          return
        }

        const { lobby, player } = match
        if (player.reconnectDeadline && player.reconnectDeadline <= Date.now()) {
          const lobbyCode = lobby.getCode()
          wavelengthGameManager.removePlayer(player.id)
          const remainingLobby = wavelengthGameManager.findLobbyByCode(lobbyCode)
          if (remainingLobby) {
            handleRosterChange(io, remainingLobby)
          }
          callback?.({ error: 'Reconnect-Fenster abgelaufen.' })
          return
        }

        cancelEviction(player.id)
        lobby.markConnected(player.id)
        attachSocketToPlayer(socket, lobby, player)
        callback?.({ ok: true, session: buildSession(lobby, player) })
        // Coming back changes the eligible voter count, and the returning
        // client needs to see an open vote at all.
        refreshVoteKick(lobby.getCode(), true)
        socket.emit('wvl:votekick:state', getVoteKick(lobby.getCode()))
        broadcastCurrentState(io, lobby)
      } catch (error: any) {
        callback?.({ error: error.message })
      }
    })

    socket.on('wvl:lobby:start', (callback?: (response: WavelengthAck) => void) => {
      try {
        const playerId = socket.data.wavelengthPlayerId as string | undefined
        if (!playerId) {
          callback?.({ error: 'Lobby nicht gefunden.' })
          return
        }

        const lobby = wavelengthGameManager.findLobbyByPlayerId(playerId)
        if (!lobby) {
          callback?.({ error: 'Lobby nicht gefunden.' })
          return
        }
        if (lobby.getHostId() !== playerId) {
          callback?.({ error: 'Nur der Host kann starten.' })
          return
        }
        if (lobby.getActivePlayers().length < 2) {
          callback?.({ error: 'Mindestens 2 verbundene Spieler sind erforderlich.' })
          return
        }

        lobby.startVoting()
        callback?.({ ok: true })
        broadcastVotingState(io, lobby)
      } catch (error: any) {
        callback?.({ error: error.message })
      }
    })

    socket.on('wvl:vote', (number: number, callback?: (response: WavelengthAck) => void) => {
      try {
        const playerId = socket.data.wavelengthPlayerId as string | undefined
        if (!playerId) {
          callback?.({ error: 'Lobby nicht gefunden.' })
          return
        }

        const lobby = wavelengthGameManager.findLobbyByPlayerId(playerId)
        if (!lobby) {
          callback?.({ error: 'Lobby nicht gefunden.' })
          return
        }
        if (!lobby.submitVote(playerId, number)) {
          callback?.({ error: 'Ungültige Stimme.' })
          return
        }

        callback?.({ ok: true })
        advanceVotingIfReady(io, lobby)
      } catch (error: any) {
        callback?.({ error: error.message })
      }
    })

    socket.on('wvl:ask-question', (targetPlayerId: string, question: string, callback?: (response: WavelengthAck) => void) => {
      try {
        const playerId = socket.data.wavelengthPlayerId as string | undefined
        if (!playerId) {
          callback?.({ error: 'Spiel nicht gefunden.' })
          return
        }

        const lobby = wavelengthGameManager.findLobbyByPlayerId(playerId)
        if (!lobby) {
          callback?.({ error: 'Spiel nicht gefunden.' })
          return
        }
        if (!lobby.askQuestion(playerId, targetPlayerId, question)) {
          callback?.({ error: 'Diese Frage kann gerade nicht gestellt werden.' })
          return
        }

        callback?.({ ok: true })
        broadcastGameState(io, lobby)
      } catch (error: any) {
        callback?.({ error: error.message })
      }
    })

    socket.on('wvl:answer-question', (answer: string, callback?: (response: WavelengthAck) => void) => {
      try {
        const playerId = socket.data.wavelengthPlayerId as string | undefined
        if (!playerId) {
          callback?.({ error: 'Spiel nicht gefunden.' })
          return
        }

        const lobby = wavelengthGameManager.findLobbyByPlayerId(playerId)
        if (!lobby) {
          callback?.({ error: 'Spiel nicht gefunden.' })
          return
        }
        if (!lobby.answerQuestion(playerId, answer)) {
          callback?.({ error: 'Diese Antwort kann gerade nicht abgegeben werden.' })
          return
        }

        callback?.({ ok: true })
        broadcastGameState(io, lobby)
      } catch (error: any) {
        callback?.({ error: error.message })
      }
    })

    socket.on('wvl:make-guess', (guess: number, callback?: (response: WavelengthAck) => void) => {
      try {
        const playerId = socket.data.wavelengthPlayerId as string | undefined
        if (!playerId) {
          callback?.({ error: 'Spiel nicht gefunden.' })
          return
        }

        const lobby = wavelengthGameManager.findLobbyByPlayerId(playerId)
        if (!lobby) {
          callback?.({ error: 'Spiel nicht gefunden.' })
          return
        }
        if (!lobby.makeGuess(playerId, guess)) {
          callback?.({ error: 'Du kannst gerade noch keinen Guess abgeben.' })
          return
        }

        callback?.({ ok: true })
        broadcastResultState(io, lobby)
      } catch (error: any) {
        callback?.({ error: error.message })
      }
    })

    socket.on('wvl:play-again', (callback?: (response: WavelengthAck) => void) => {
      try {
        const playerId = socket.data.wavelengthPlayerId as string | undefined
        if (!playerId) {
          callback?.({ error: 'Lobby nicht gefunden.' })
          return
        }

        const lobby = wavelengthGameManager.findLobbyByPlayerId(playerId)
        if (!lobby) {
          callback?.({ error: 'Lobby nicht gefunden.' })
          return
        }
        if (lobby.getHostId() !== playerId) {
          callback?.({ error: 'Nur der Host kann eine neue Runde starten.' })
          return
        }

        lobby.createArchiveSnapshot()
        lobby.resetForNewRound()
        lobby.startVoting()
        callback?.({ ok: true })
        broadcastVotingState(io, lobby)
      } catch (error: any) {
        callback?.({ error: error.message })
      }
    })

    socket.on('wvl:end-game', (callback?: (response: WavelengthAck) => void) => {
      try {
        const playerId = socket.data.wavelengthPlayerId as string | undefined
        if (!playerId) {
          callback?.({ error: 'Lobby nicht gefunden.' })
          return
        }

        const lobby = wavelengthGameManager.findLobbyByPlayerId(playerId)
        if (!lobby) {
          callback?.({ error: 'Lobby nicht gefunden.' })
          return
        }
        if (lobby.getHostId() !== playerId) {
          callback?.({ error: 'Nur der Host kann das Spiel beenden.' })
          return
        }

        lobby.createArchiveSnapshot()
        const code = lobby.getCode()
        lobby.getPlayers().forEach(player => cancelEviction(player.id))
        io.to(code).emit('wvl:lobby:closed')
        cancelVoteKick(code)
        wavelengthGameManager.removeLobby(code)
        callback?.({ ok: true })
      } catch (error: any) {
        callback?.({ error: error.message })
      }
    })

    socket.on('wvl:lobby:close', (callback?: (response: WavelengthAck) => void) => {
      try {
        const playerId = socket.data.wavelengthPlayerId as string | undefined
        if (!playerId) {
          callback?.({ error: 'Lobby nicht gefunden.' })
          return
        }

        const lobby = wavelengthGameManager.findLobbyByPlayerId(playerId)
        if (!lobby) {
          callback?.({ error: 'Lobby nicht gefunden.' })
          return
        }
        if (lobby.getHostId() !== playerId) {
          callback?.({ error: 'Nur der Host kann die Lobby schließen.' })
          return
        }

        const code = lobby.getCode()
        lobby.getPlayers().forEach(player => cancelEviction(player.id))
        io.to(code).emit('wvl:lobby:closed')
        cancelVoteKick(code)
        wavelengthGameManager.removeLobby(code)
        callback?.({ ok: true })
      } catch (error: any) {
        callback?.({ error: error.message })
      }
    })

    socket.on('wvl:lobby:leave', (callback?: (response: WavelengthAck) => void) => {
      try {
        const playerId = socket.data.wavelengthPlayerId as string | undefined
        if (!playerId) {
          callback?.({ ok: true })
          return
        }

        const lobby = wavelengthGameManager.findLobbyByPlayerId(playerId)
        if (!lobby) {
          callback?.({ ok: true })
          return
        }

        const code = lobby.getCode()
        cancelEviction(playerId)
        wavelengthGameManager.removePlayer(playerId)
        socket.leave(code)
        socket.leave(playerId)

        const remainingLobby = wavelengthGameManager.findLobbyByCode(code)
        if (!remainingLobby) {
          cancelVoteKick(code)
          callback?.({ ok: true })
          return
        }
        refreshVoteKick(code, !isVoteKickTarget(code, playerId))
        handleRosterChange(io, remainingLobby)

        callback?.({ ok: true })
      } catch (error: any) {
        callback?.({ error: error.message })
      }
    })

    // Start a vote to kick a player. Open to every connected player, not only
    // the host, so a lobby can clear out a troublemaker on its own.
    socket.on('wvl:votekick:start', (targetId: string, callback?: (response: WavelengthAck) => void) => {
      try {
        const playerId = socket.data.wavelengthPlayerId as string | undefined
        if (!playerId) {
          callback?.({ error: 'Lobby nicht gefunden.' })
          return
        }

        const lobby = wavelengthGameManager.findLobbyByPlayerId(playerId)
        if (!lobby) {
          callback?.({ error: 'Lobby nicht gefunden.' })
          return
        }

        const target = lobby.getPlayer(targetId)
        if (!target) {
          callback?.({ error: 'Spieler nicht in der Lobby.' })
          return
        }

        const code = lobby.getCode()
        startVoteKick({
          lobbyCode: code,
          targetId,
          targetName: target.name,
          initiatorId: playerId,
          getEligibleIds: () => voteKickEligibleIds(code, targetId),
          onChange: handleVoteKickChange(io, code, targetId, target.name)
        })
        callback?.({ ok: true })
      } catch (error: any) {
        callback?.({ error: error.message })
      }
    })

    socket.on('wvl:votekick:vote', (approve: boolean, callback?: (response: WavelengthAck) => void) => {
      try {
        const playerId = socket.data.wavelengthPlayerId as string | undefined
        if (!playerId) {
          callback?.({ error: 'Lobby nicht gefunden.' })
          return
        }

        const lobby = wavelengthGameManager.findLobbyByPlayerId(playerId)
        if (!lobby) {
          callback?.({ error: 'Lobby nicht gefunden.' })
          return
        }

        castVoteKickVote(lobby.getCode(), playerId, approve)
        callback?.({ ok: true })
      } catch (error: any) {
        callback?.({ error: error.message })
      }
    })

    // Remove a specific player from the lobby (host only).
    socket.on('wvl:lobby:kick', async (targetId: string, callback?: (response: WavelengthAck) => void) => {
      try {
        const playerId = socket.data.wavelengthPlayerId as string | undefined
        if (!playerId) {
          callback?.({ error: 'Lobby nicht gefunden.' })
          return
        }

        const lobby = wavelengthGameManager.findLobbyByPlayerId(playerId)
        if (!lobby) {
          callback?.({ error: 'Lobby nicht gefunden.' })
          return
        }
        if (lobby.getHostId() !== playerId) {
          callback?.({ error: 'Nur der Host kann Spieler entfernen.' })
          return
        }
        if (!targetId || targetId === playerId) {
          callback?.({ error: 'Ungültiger Spieler.' })
          return
        }
        if (!lobby.hasPlayer(targetId)) {
          callback?.({ error: 'Spieler nicht in der Lobby.' })
          return
        }

        await evictPlayer(io, lobby.getCode(), targetId, 'Du wurdest aus der Lobby entfernt.')
        callback?.({ ok: true })
      } catch (error: any) {
        callback?.({ error: error.message })
      }
    })

    socket.on('disconnect', () => {
      try {
        const playerId = socket.data.wavelengthPlayerId as string | undefined
        if (!playerId) return

        const room = io.sockets.adapter.rooms.get(playerId)
        if (room && room.size > 0) return

        const lobby = wavelengthGameManager.findLobbyByPlayerId(playerId)
        if (!lobby) return

        // Outside the waiting room the seat is held without a deadline so a
        // dropped player can rejoin the running game whenever they get back.
        const keepSeat = lobby.getPhase() !== 'waiting'
        lobby.markDisconnected(playerId, keepSeat ? null : Date.now() + RECONNECT_GRACE_MS)
        if (keepSeat) {
          cancelEviction(playerId)
        } else {
          scheduleEviction(io, playerId)
        }
        // Dropping out removes the player from the eligible voters, so an open
        // vote can tip over because of it.
        refreshVoteKick(lobby.getCode(), true)
        broadcastCurrentState(io, lobby)
      } catch (error) {
        console.error('Wavelength disconnect error:', error)
      }
    })
  })
}
