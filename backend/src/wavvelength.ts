import { randomUUID } from 'node:crypto'
import { Server as SocketIOServer, Socket } from 'socket.io'
import { WavvelengthGameManager } from './game/WavvelengthGameManager'
import { WavvelengthLobby, WavvelengthPlayer } from './game/WavvelengthLobby'

const RECONNECT_GRACE_MS = 120_000
const wavvelengthGameManager = new WavvelengthGameManager()
const evictionTimers = new Map<string, NodeJS.Timeout>()

interface WavvelengthSession {
  playerId: string
  reconnectKey: string
  lobbyCode: string
  playerName: string
  reconnectDeadline: number | null
}

interface WavvelengthAck {
  ok?: boolean
  code?: string
  error?: string
  session?: WavvelengthSession
}

function cancelEviction(playerId: string) {
  const timer = evictionTimers.get(playerId)
  if (!timer) return

  clearTimeout(timer)
  evictionTimers.delete(playerId)
}

function buildSession(lobby: WavvelengthLobby, player: WavvelengthPlayer): WavvelengthSession {
  return {
    playerId: player.id,
    reconnectKey: player.reconnectKey,
    lobbyCode: lobby.getCode(),
    playerName: player.name,
    reconnectDeadline: player.reconnectDeadline ?? null
  }
}

function attachSocketToPlayer(socket: Socket, lobby: WavvelengthLobby, player: WavvelengthPlayer) {
  socket.data.wavvelengthPlayerId = player.id
  socket.data.wavvelengthReconnectKey = player.reconnectKey
  socket.join(player.id)
  socket.join(lobby.getCode())
}

function buildGameState(lobby: WavvelengthLobby, playerId: string) {
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

function buildResultState(lobby: WavvelengthLobby, playerId: string) {
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

function broadcastLobbyState(io: SocketIOServer, lobby: WavvelengthLobby) {
  io.to(lobby.getCode()).emit('wvl:lobby:update', lobby.getState())
}

function broadcastVotingState(io: SocketIOServer, lobby: WavvelengthLobby) {
  io.to(lobby.getCode()).emit('wvl:voting:started', lobby.getState())
}

function broadcastGameState(io: SocketIOServer, lobby: WavvelengthLobby) {
  lobby.getPlayers().forEach(player => {
    const state = buildGameState(lobby, player.id)
    if (state) {
      io.to(player.id).emit('wvl:game:state', state)
    }
  })
}

function broadcastResultState(io: SocketIOServer, lobby: WavvelengthLobby) {
  lobby.getPlayers().forEach(player => {
    const state = buildResultState(lobby, player.id)
    if (state) {
      io.to(player.id).emit('wvl:result:state', state)
    }
  })
}

function broadcastCurrentState(io: SocketIOServer, lobby: WavvelengthLobby) {
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

function advanceVotingIfReady(io: SocketIOServer, lobby: WavvelengthLobby) {
  if (!lobby.haveAllPlayersVoted()) {
    broadcastVotingState(io, lobby)
    return
  }

  lobby.determineSeekerAndNumber()
  lobby.startGame()
  broadcastGameState(io, lobby)
}

function handleRosterChange(io: SocketIOServer, lobby: WavvelengthLobby) {
  if (lobby.getPlayers().length === 0) return

  if (lobby.getPhase() === 'voting' && lobby.haveAllPlayersVoted()) {
    advanceVotingIfReady(io, lobby)
    return
  }

  broadcastCurrentState(io, lobby)
}

function scheduleEviction(io: SocketIOServer, playerId: string) {
  cancelEviction(playerId)
  const timer = setTimeout(() => {
    evictionTimers.delete(playerId)

    const lobby = wavvelengthGameManager.findLobbyByPlayerId(playerId)
    if (!lobby || !lobby.isDisconnected(playerId)) return

    const code = lobby.getCode()
    wavvelengthGameManager.removePlayer(playerId)
    const remainingLobby = wavvelengthGameManager.findLobbyByCode(code)
    if (remainingLobby) {
      handleRosterChange(io, remainingLobby)
    }
  }, RECONNECT_GRACE_MS)

  evictionTimers.set(playerId, timer)
}

export function setupWavvelengthSocketHandlers(io: SocketIOServer) {
  io.on('connection', (socket: Socket) => {
    socket.on('wvl:lobby:create', (nickname: string, callback?: (response: WavvelengthAck) => void) => {
      try {
        const trimmedName = nickname?.trim()
        if (!trimmedName) {
          callback?.({ error: 'Name darf nicht leer sein.' })
          return
        }

        const playerId = randomUUID()
        const lobby = wavvelengthGameManager.createLobby(playerId, trimmedName)
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

    socket.on('wvl:lobby:join', (code: string, nickname: string, callback?: (response: WavvelengthAck) => void) => {
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

        const existingLobby = wavvelengthGameManager.findLobbyByCode(normalizedCode)
        if (!existingLobby) {
          callback?.({ error: 'Lobby nicht gefunden.' })
          return
        }
        if (existingLobby.getPhase() !== 'waiting') {
          callback?.({ error: 'Das Spiel hat bereits begonnen.' })
          return
        }

        const playerId = randomUUID()
        const lobby = wavvelengthGameManager.joinLobby(playerId, normalizedCode, trimmedName)
        const player = lobby.getPlayer(playerId)
        if (!player) {
          callback?.({ error: 'Spieler konnte nicht beitreten.' })
          return
        }

        cancelEviction(player.id)
        attachSocketToPlayer(socket, lobby, player)
        callback?.({ ok: true, code: lobby.getCode(), session: buildSession(lobby, player) })
        broadcastLobbyState(io, lobby)
      } catch (error: any) {
        callback?.({ error: error.message === 'Name already taken' ? 'Dieser Name ist bereits vergeben.' : error.message })
      }
    })

    socket.on('wvl:session:resume', (reconnectKey: string, code: string, callback?: (response: WavvelengthAck) => void) => {
      try {
        if (!reconnectKey || typeof reconnectKey !== 'string') {
          callback?.({ error: 'Reconnect-Schlüssel fehlt.' })
          return
        }

        const match = wavvelengthGameManager.findPlayerByReconnectKey(reconnectKey, code)
        if (!match) {
          callback?.({ error: 'Reconnect-Fenster abgelaufen oder Session ungültig.' })
          return
        }

        const { lobby, player } = match
        if (player.reconnectDeadline && player.reconnectDeadline <= Date.now()) {
          const lobbyCode = lobby.getCode()
          wavvelengthGameManager.removePlayer(player.id)
          const remainingLobby = wavvelengthGameManager.findLobbyByCode(lobbyCode)
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
        broadcastCurrentState(io, lobby)
      } catch (error: any) {
        callback?.({ error: error.message })
      }
    })

    socket.on('wvl:lobby:start', (callback?: (response: WavvelengthAck) => void) => {
      try {
        const playerId = socket.data.wavvelengthPlayerId as string | undefined
        if (!playerId) {
          callback?.({ error: 'Lobby nicht gefunden.' })
          return
        }

        const lobby = wavvelengthGameManager.findLobbyByPlayerId(playerId)
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

    socket.on('wvl:vote', (number: number, callback?: (response: WavvelengthAck) => void) => {
      try {
        const playerId = socket.data.wavvelengthPlayerId as string | undefined
        if (!playerId) {
          callback?.({ error: 'Lobby nicht gefunden.' })
          return
        }

        const lobby = wavvelengthGameManager.findLobbyByPlayerId(playerId)
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

    socket.on('wvl:ask-question', (targetPlayerId: string, question: string, callback?: (response: WavvelengthAck) => void) => {
      try {
        const playerId = socket.data.wavvelengthPlayerId as string | undefined
        if (!playerId) {
          callback?.({ error: 'Spiel nicht gefunden.' })
          return
        }

        const lobby = wavvelengthGameManager.findLobbyByPlayerId(playerId)
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

    socket.on('wvl:answer-question', (answer: string, callback?: (response: WavvelengthAck) => void) => {
      try {
        const playerId = socket.data.wavvelengthPlayerId as string | undefined
        if (!playerId) {
          callback?.({ error: 'Spiel nicht gefunden.' })
          return
        }

        const lobby = wavvelengthGameManager.findLobbyByPlayerId(playerId)
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

    socket.on('wvl:make-guess', (guess: number, callback?: (response: WavvelengthAck) => void) => {
      try {
        const playerId = socket.data.wavvelengthPlayerId as string | undefined
        if (!playerId) {
          callback?.({ error: 'Spiel nicht gefunden.' })
          return
        }

        const lobby = wavvelengthGameManager.findLobbyByPlayerId(playerId)
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

    socket.on('wvl:play-again', (callback?: (response: WavvelengthAck) => void) => {
      try {
        const playerId = socket.data.wavvelengthPlayerId as string | undefined
        if (!playerId) {
          callback?.({ error: 'Lobby nicht gefunden.' })
          return
        }

        const lobby = wavvelengthGameManager.findLobbyByPlayerId(playerId)
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

    socket.on('wvl:end-game', (callback?: (response: WavvelengthAck) => void) => {
      try {
        const playerId = socket.data.wavvelengthPlayerId as string | undefined
        if (!playerId) {
          callback?.({ error: 'Lobby nicht gefunden.' })
          return
        }

        const lobby = wavvelengthGameManager.findLobbyByPlayerId(playerId)
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
        wavvelengthGameManager.removeLobby(code)
        callback?.({ ok: true })
      } catch (error: any) {
        callback?.({ error: error.message })
      }
    })

    socket.on('wvl:lobby:close', (callback?: (response: WavvelengthAck) => void) => {
      try {
        const playerId = socket.data.wavvelengthPlayerId as string | undefined
        if (!playerId) {
          callback?.({ error: 'Lobby nicht gefunden.' })
          return
        }

        const lobby = wavvelengthGameManager.findLobbyByPlayerId(playerId)
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
        wavvelengthGameManager.removeLobby(code)
        callback?.({ ok: true })
      } catch (error: any) {
        callback?.({ error: error.message })
      }
    })

    socket.on('wvl:lobby:leave', (callback?: (response: WavvelengthAck) => void) => {
      try {
        const playerId = socket.data.wavvelengthPlayerId as string | undefined
        if (!playerId) {
          callback?.({ ok: true })
          return
        }

        const lobby = wavvelengthGameManager.findLobbyByPlayerId(playerId)
        if (!lobby) {
          callback?.({ ok: true })
          return
        }

        const code = lobby.getCode()
        cancelEviction(playerId)
        wavvelengthGameManager.removePlayer(playerId)
        socket.leave(code)
        socket.leave(playerId)

        const remainingLobby = wavvelengthGameManager.findLobbyByCode(code)
        if (remainingLobby) {
          handleRosterChange(io, remainingLobby)
        }

        callback?.({ ok: true })
      } catch (error: any) {
        callback?.({ error: error.message })
      }
    })

    socket.on('disconnect', () => {
      try {
        const playerId = socket.data.wavvelengthPlayerId as string | undefined
        if (!playerId) return

        const room = io.sockets.adapter.rooms.get(playerId)
        if (room && room.size > 0) return

        const lobby = wavvelengthGameManager.findLobbyByPlayerId(playerId)
        if (!lobby) return

        lobby.markDisconnected(playerId, Date.now() + RECONNECT_GRACE_MS)
        scheduleEviction(io, playerId)
        broadcastCurrentState(io, lobby)
      } catch (error) {
        console.error('Wavvelength disconnect error:', error)
      }
    })
  })
}
