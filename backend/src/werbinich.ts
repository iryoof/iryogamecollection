import { randomUUID } from 'node:crypto'
import { Server as SocketIOServer, Socket } from 'socket.io'

const RECONNECT_GRACE_MS = 120_000

interface WerBinIchSession {
  playerId: string
  reconnectKey: string
  lobbyCode: string
  playerName: string
  reconnectDeadline: number | null
}

interface WerBinIchPlayer {
  id: string
  name: string
  isHost: boolean
  reconnectKey: string
  reconnectDeadline: number | null
}

interface WerBinIchWordEntry {
  word: string
  authorId: string
}

interface WerBinIchSolvedInfo {
  word: string
  authorName: string
}

interface WerBinIchLobby {
  code: string
  players: WerBinIchPlayer[]
  state: 'waiting' | 'writing' | 'playing'
  assignments: Record<string, string>
  words: Record<string, WerBinIchWordEntry>
  solved: Record<string, boolean>
  solvedInfo: Record<string, WerBinIchSolvedInfo | null>
}

interface AckPayload {
  ok?: boolean
  code?: string
  word?: string
  authorName?: string
  error?: string
  session?: WerBinIchSession
}

const werBinIchLobbies = new Map<string, WerBinIchLobby>()
const evictionTimers = new Map<string, NodeJS.Timeout>()

function generateCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < 5; i += 1) {
    code += chars[Math.floor(Math.random() * chars.length)]
  }
  return code
}

function cancelEviction(playerId: string) {
  const timer = evictionTimers.get(playerId)
  if (!timer) return
  clearTimeout(timer)
  evictionTimers.delete(playerId)
}

function createLobby(hostSocket: Socket, hostName: string): { lobby: WerBinIchLobby; player: WerBinIchPlayer } {
  let code = generateCode()
  while (werBinIchLobbies.has(code)) {
    code = generateCode()
  }

  const hostPlayer: WerBinIchPlayer = {
    id: randomUUID(),
    name: hostName,
    isHost: true,
    reconnectKey: randomUUID(),
    reconnectDeadline: null
  }

  const lobby: WerBinIchLobby = {
    code,
    players: [hostPlayer],
    state: 'waiting',
    assignments: {},
    words: {},
    solved: {},
    solvedInfo: {}
  }

  werBinIchLobbies.set(code, lobby)
  return { lobby, player: hostPlayer }
}

function buildSession(lobby: WerBinIchLobby, player: WerBinIchPlayer): WerBinIchSession {
  return {
    playerId: player.id,
    reconnectKey: player.reconnectKey,
    lobbyCode: lobby.code,
    playerName: player.name,
    reconnectDeadline: player.reconnectDeadline
  }
}

function bindSocketToPlayer(socket: Socket, lobby: WerBinIchLobby, player: WerBinIchPlayer) {
  socket.data.werBinIchPlayerId = player.id
  socket.data.werBinIchReconnectKey = player.reconnectKey
  socket.join(player.id)
  socket.join(lobby.code)
}

function findLobbyByPlayerId(playerId: string): WerBinIchLobby | null {
  for (const lobby of werBinIchLobbies.values()) {
    if (lobby.players.some(player => player.id === playerId)) {
      return lobby
    }
  }
  return null
}

function findPlayerByReconnectKey(reconnectKey: string): { lobby: WerBinIchLobby; player: WerBinIchPlayer } | null {
  for (const lobby of werBinIchLobbies.values()) {
    const player = lobby.players.find(entry => entry.reconnectKey === reconnectKey)
    if (player) {
      return { lobby, player }
    }
  }
  return null
}

function buildLobbyState(lobby: WerBinIchLobby) {
  return {
    code: lobby.code,
    state: lobby.state,
    players: lobby.players.map(player => ({
      id: player.id,
      name: player.name,
      isHost: player.isHost,
      isDisconnected: !!player.reconnectDeadline,
      reconnectDeadline: player.reconnectDeadline
    }))
  }
}

function broadcastLobby(io: SocketIOServer, lobby: WerBinIchLobby) {
  const payload = buildLobbyState(lobby)
  lobby.players.forEach(player => {
    io.to(player.id).emit('lobby:update', payload)
  })
}

function checkAllWordsWritten(lobby: WerBinIchLobby): boolean {
  return lobby.players.every(player => !!lobby.words[player.id])
}

function assignPlayers(lobby: WerBinIchLobby) {
  const ids = lobby.players.map(player => player.id)
  let shuffled: string[] = []

  do {
    shuffled = [...ids]
    for (let i = shuffled.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
    }
  } while (shuffled.some((id, index) => id === ids[index]))

  lobby.assignments = {}
  ids.forEach((id, index) => {
    lobby.assignments[id] = shuffled[index]
  })
}

function buildGameState(lobby: WerBinIchLobby, player: WerBinIchPlayer) {
  const others = lobby.players
    .filter(otherPlayer => otherPlayer.id !== player.id)
    .map(otherPlayer => {
      const wordEntry = lobby.words[otherPlayer.id]
      return {
        id: otherPlayer.id,
        name: otherPlayer.name,
        word: wordEntry ? wordEntry.word : null,
        solved: !!lobby.solved[otherPlayer.id],
        isDisconnected: !!otherPlayer.reconnectDeadline,
        reconnectDeadline: otherPlayer.reconnectDeadline
      }
    })

  const solvedInfo = lobby.solvedInfo[player.id] || null
  const myAssignmentTarget = lobby.assignments[player.id]
  const targetWordExists = myAssignmentTarget ? !!lobby.words[myAssignmentTarget] : true

  return {
    state: lobby.state,
    others,
    myWord: lobby.solved[player.id] && solvedInfo ? solvedInfo.word : null,
    myWordAuthor: lobby.solved[player.id] && solvedInfo ? solvedInfo.authorName : null,
    iSolved: !!lobby.solved[player.id],
    needsToWrite: lobby.state === 'writing' && !targetWordExists,
    writeForPlayer: myAssignmentTarget
      ? lobby.players.find(otherPlayer => otherPlayer.id === myAssignmentTarget)?.name || null
      : null,
    writeForPlayerId: myAssignmentTarget || null,
    allWordsWritten: checkAllWordsWritten(lobby),
    isHost: player.isHost,
    players: lobby.players.map(otherPlayer => ({
      id: otherPlayer.id,
      name: otherPlayer.name,
      isHost: otherPlayer.isHost,
      isDisconnected: !!otherPlayer.reconnectDeadline,
      reconnectDeadline: otherPlayer.reconnectDeadline
    }))
  }
}

function broadcastGameState(io: SocketIOServer, lobby: WerBinIchLobby) {
  lobby.players.forEach(player => {
    io.to(player.id).emit('game:state', buildGameState(lobby, player))
  })
}

function removePlayerFromLobby(io: SocketIOServer, lobby: WerBinIchLobby, playerId: string) {
  const leavingPlayer = lobby.players.find(player => player.id === playerId)
  if (!leavingPlayer) return

  cancelEviction(playerId)
  const wasHost = leavingPlayer.isHost
  lobby.players = lobby.players.filter(player => player.id !== playerId)

  delete lobby.assignments[playerId]
  delete lobby.words[playerId]
  delete lobby.solved[playerId]
  delete lobby.solvedInfo[playerId]

  for (const [assignee, target] of Object.entries(lobby.assignments)) {
    if (target === playerId) {
      delete lobby.assignments[assignee]
    }
  }

  if (lobby.players.length === 0) {
    werBinIchLobbies.delete(lobby.code)
    return
  }

  if (wasHost) {
    lobby.players[0].isHost = true
  }

  if (lobby.state === 'writing' && checkAllWordsWritten(lobby)) {
    lobby.state = 'playing'
  }

  if (lobby.state === 'waiting') {
    broadcastLobby(io, lobby)
    return
  }

  broadcastGameState(io, lobby)
}

function scheduleEviction(io: SocketIOServer, lobbyCode: string, playerId: string) {
  cancelEviction(playerId)
  const timer = setTimeout(() => {
    evictionTimers.delete(playerId)
    const lobby = werBinIchLobbies.get(lobbyCode)
    if (!lobby) return
    const player = lobby.players.find(entry => entry.id === playerId)
    if (!player || !player.reconnectDeadline || player.reconnectDeadline > Date.now()) return
    removePlayerFromLobby(io, lobby, playerId)
  }, RECONNECT_GRACE_MS)
  evictionTimers.set(playerId, timer)
}

function markPlayerDisconnected(io: SocketIOServer, lobby: WerBinIchLobby, playerId: string) {
  const player = lobby.players.find(entry => entry.id === playerId)
  if (!player || player.reconnectDeadline) return

  player.reconnectDeadline = Date.now() + RECONNECT_GRACE_MS
  scheduleEviction(io, lobby.code, playerId)

  if (lobby.state === 'waiting') {
    broadcastLobby(io, lobby)
    return
  }

  broadcastGameState(io, lobby)
}

function clearPlayerReconnectState(player: WerBinIchPlayer) {
  player.reconnectDeadline = null
  cancelEviction(player.id)
}

export function setupWerBinIchSocketHandlers(io: SocketIOServer) {
  io.on('connection', (socket: Socket) => {
    socket.on('lobby:create', (name: string, callback?: (payload: AckPayload) => void) => {
      if (!name || typeof name !== 'string' || name.trim().length === 0) {
        callback?.({ error: 'Name darf nicht leer sein.' })
        return
      }

      const { lobby, player } = createLobby(socket, name.trim())
      bindSocketToPlayer(socket, lobby, player)
      broadcastLobby(io, lobby)
      callback?.({ code: lobby.code, session: buildSession(lobby, player) })
    })

    socket.on(
      'lobby:join',
      (
        payload: { name: string; code: string },
        callback?: (response: AckPayload) => void
      ) => {
        const { name, code } = payload || {}
        if (!name || typeof name !== 'string' || name.trim().length === 0) {
          callback?.({ error: 'Name darf nicht leer sein.' })
          return
        }
        if (!code || typeof code !== 'string') {
          callback?.({ error: 'Code darf nicht leer sein.' })
          return
        }

        const normalizedCode = code.trim().toUpperCase()
        const lobby = werBinIchLobbies.get(normalizedCode)
        if (!lobby) {
          callback?.({ error: 'Lobby nicht gefunden.' })
          return
        }
        if (lobby.state !== 'waiting') {
          callback?.({ error: 'Das Spiel hat bereits begonnen.' })
          return
        }
        if (lobby.players.some(player => player.name.toLowerCase() === name.trim().toLowerCase())) {
          callback?.({ error: 'Dieser Name ist bereits vergeben.' })
          return
        }

        const player: WerBinIchPlayer = {
          id: randomUUID(),
          name: name.trim(),
          isHost: false,
          reconnectKey: randomUUID(),
          reconnectDeadline: null
        }

        lobby.players.push(player)
        bindSocketToPlayer(socket, lobby, player)
        broadcastLobby(io, lobby)
        callback?.({ code: lobby.code, session: buildSession(lobby, player) })
      }
    )

    socket.on('session:resume', (reconnectKey: string, callback?: (payload: AckPayload) => void) => {
      if (!reconnectKey || typeof reconnectKey !== 'string') {
        callback?.({ error: 'Reconnect-Schluessel fehlt.' })
        return
      }

      const match = findPlayerByReconnectKey(reconnectKey)
      if (!match) {
        callback?.({ error: 'Reconnect-Fenster abgelaufen oder Session ungueltig.' })
        return
      }

      const { lobby, player } = match
      if (player.reconnectDeadline && player.reconnectDeadline <= Date.now()) {
        removePlayerFromLobby(io, lobby, player.id)
        callback?.({ error: 'Reconnect-Fenster abgelaufen.' })
        return
      }

      clearPlayerReconnectState(player)
      bindSocketToPlayer(socket, lobby, player)

      if (lobby.state === 'waiting') {
        broadcastLobby(io, lobby)
      } else {
        broadcastGameState(io, lobby)
      }

      callback?.({ ok: true, session: buildSession(lobby, player) })
    })

    socket.on('game:start', (callback?: (payload: AckPayload) => void) => {
      const playerId = socket.data.werBinIchPlayerId as string | undefined
      if (!playerId) {
        callback?.({ error: 'Lobby nicht gefunden.' })
        return
      }

      const lobby = findLobbyByPlayerId(playerId)
      if (!lobby) {
        callback?.({ error: 'Lobby nicht gefunden.' })
        return
      }

      const player = lobby.players.find(entry => entry.id === playerId)
      if (!player?.isHost) {
        callback?.({ error: 'Nur der Host kann das Spiel starten.' })
        return
      }
      if (lobby.players.length < 2) {
        callback?.({ error: 'Mindestens 2 Spieler erforderlich.' })
        return
      }

      lobby.state = 'writing'
      lobby.words = {}
      lobby.solved = {}
      lobby.solvedInfo = {}
      assignPlayers(lobby)
      broadcastGameState(io, lobby)
      callback?.({ ok: true })
    })

    socket.on(
      'game:submitWord',
      (
        payload: { word: string },
        callback?: (response: AckPayload) => void
      ) => {
        const playerId = socket.data.werBinIchPlayerId as string | undefined
        if (!playerId) {
          callback?.({ error: 'Lobby nicht gefunden.' })
          return
        }

        const lobby = findLobbyByPlayerId(playerId)
        if (!lobby) {
          callback?.({ error: 'Lobby nicht gefunden.' })
          return
        }

        const word = payload?.word?.trim()
        if (!word) {
          callback?.({ error: 'Wort darf nicht leer sein.' })
          return
        }

        const targetId = lobby.assignments[playerId]
        if (!targetId) {
          callback?.({ error: 'Kein Ziel zugewiesen.' })
          return
        }

        lobby.words[targetId] = { word, authorId: playerId }
        callback?.({ ok: true })

        if (checkAllWordsWritten(lobby)) {
          lobby.state = 'playing'
        }
        broadcastGameState(io, lobby)
      }
    )

    socket.on('game:solve', (callback?: (payload: AckPayload) => void) => {
      const playerId = socket.data.werBinIchPlayerId as string | undefined
      if (!playerId) {
        callback?.({ error: 'Spiel laeuft nicht.' })
        return
      }

      const lobby = findLobbyByPlayerId(playerId)
      if (!lobby || lobby.state !== 'playing') {
        callback?.({ error: 'Spiel laeuft nicht.' })
        return
      }

      const wordEntry = lobby.words[playerId]
      if (!wordEntry) {
        callback?.({ error: 'Kein Wort vorhanden.' })
        return
      }

      lobby.solved[playerId] = true
      const author = lobby.players.find(player => player.id === wordEntry.authorId)
      lobby.solvedInfo[playerId] = {
        word: wordEntry.word,
        authorName: author ? author.name : 'Unbekannt'
      }

      broadcastGameState(io, lobby)
      callback?.({ ok: true, word: wordEntry.word, authorName: author?.name || 'Unbekannt' })
    })

    socket.on(
      'game:writeNewWord',
      (
        payload: { targetId: string; word: string },
        callback?: (response: AckPayload) => void
      ) => {
        const playerId = socket.data.werBinIchPlayerId as string | undefined
        if (!playerId) {
          callback?.({ error: 'Spiel laeuft nicht.' })
          return
        }

        const lobby = findLobbyByPlayerId(playerId)
        if (!lobby || lobby.state !== 'playing') {
          callback?.({ error: 'Spiel laeuft nicht.' })
          return
        }

        const word = payload?.word?.trim()
        const targetId = payload?.targetId
        if (!word) {
          callback?.({ error: 'Wort darf nicht leer sein.' })
          return
        }
        if (!targetId || !lobby.players.some(player => player.id === targetId)) {
          callback?.({ error: 'Spieler nicht gefunden.' })
          return
        }
        if (targetId === playerId) {
          callback?.({ error: 'Du kannst dir nicht selbst ein Wort geben.' })
          return
        }

        lobby.words[targetId] = { word, authorId: playerId }
        lobby.solved[targetId] = false
        lobby.solvedInfo[targetId] = null

        broadcastGameState(io, lobby)
        callback?.({ ok: true })
      }
    )

    socket.on('lobby:leave', () => {
      const playerId = socket.data.werBinIchPlayerId as string | undefined
      if (!playerId) return
      const lobby = findLobbyByPlayerId(playerId)
      if (!lobby) return
      removePlayerFromLobby(io, lobby, playerId)
    })

    socket.on('lobby:close', () => {
      const playerId = socket.data.werBinIchPlayerId as string | undefined
      if (!playerId) return

      const lobby = findLobbyByPlayerId(playerId)
      if (!lobby) return
      const player = lobby.players.find(entry => entry.id === playerId)
      if (!player?.isHost) return

      lobby.players.forEach(entry => {
        cancelEviction(entry.id)
        io.to(entry.id).emit('lobby:closed')
      })
      werBinIchLobbies.delete(lobby.code)
    })

    socket.on('disconnect', () => {
      const playerId = socket.data.werBinIchPlayerId as string | undefined
      if (!playerId) return

      const room = io.sockets.adapter.rooms.get(playerId)
      if (room && room.size > 0) return

      const lobby = findLobbyByPlayerId(playerId)
      if (!lobby) return
      markPlayerDisconnected(io, lobby, playerId)
    })
  })
}
