import { Server as SocketIOServer, Socket } from 'socket.io'

interface WerBinIchPlayer {
  id: string
  name: string
  isHost: boolean
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
}

const werBinIchLobbies = new Map<string, WerBinIchLobby>()

function generateCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < 5; i += 1) {
    code += chars[Math.floor(Math.random() * chars.length)]
  }
  return code
}

function createLobby(hostSocket: Socket, hostName: string): WerBinIchLobby {
  let code = generateCode()
  while (werBinIchLobbies.has(code)) {
    code = generateCode()
  }

  const lobby: WerBinIchLobby = {
    code,
    players: [{ id: hostSocket.id, name: hostName, isHost: true }],
    state: 'waiting',
    assignments: {},
    words: {},
    solved: {},
    solvedInfo: {}
  }

  werBinIchLobbies.set(code, lobby)
  return lobby
}

function findLobbyByPlayer(socketId: string): WerBinIchLobby | null {
  for (const lobby of werBinIchLobbies.values()) {
    if (lobby.players.some(player => player.id === socketId)) {
      return lobby
    }
  }
  return null
}

function broadcastLobby(io: SocketIOServer, lobby: WerBinIchLobby) {
  const sanitized = {
    code: lobby.code,
    state: lobby.state,
    players: lobby.players.map(player => ({
      id: player.id,
      name: player.name,
      isHost: player.isHost
    }))
  }

  lobby.players.forEach(player => {
    io.to(player.id).emit('lobby:update', sanitized)
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

function broadcastGameState(io: SocketIOServer, lobby: WerBinIchLobby) {
  lobby.players.forEach(player => {
    const others = lobby.players
      .filter(otherPlayer => otherPlayer.id !== player.id)
      .map(otherPlayer => {
        const wordEntry = lobby.words[otherPlayer.id]
        return {
          id: otherPlayer.id,
          name: otherPlayer.name,
          word: wordEntry ? wordEntry.word : null,
          solved: !!lobby.solved[otherPlayer.id]
        }
      })

    const solvedInfo = lobby.solvedInfo[player.id] || null
    const myAssignmentTarget = lobby.assignments[player.id]
    const targetWordExists = myAssignmentTarget ? !!lobby.words[myAssignmentTarget] : true

    io.to(player.id).emit('game:state', {
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
        isHost: otherPlayer.isHost
      }))
    })
  })
}

function handleDisconnect(io: SocketIOServer, socket: Socket) {
  const lobby = findLobbyByPlayer(socket.id)
  if (!lobby) return

  const leavingPlayer = lobby.players.find(player => player.id === socket.id)
  const wasHost = leavingPlayer?.isHost
  lobby.players = lobby.players.filter(player => player.id !== socket.id)

  if (lobby.players.length === 0) {
    werBinIchLobbies.delete(lobby.code)
    return
  }

  if (wasHost && lobby.players.length > 0) {
    lobby.players[0].isHost = true
  }

  if (lobby.state === 'waiting') {
    broadcastLobby(io, lobby)
    return
  }

  delete lobby.assignments[socket.id]
  delete lobby.words[socket.id]
  delete lobby.solved[socket.id]
  delete lobby.solvedInfo[socket.id]

  for (const [assignee, target] of Object.entries(lobby.assignments)) {
    if (target === socket.id) {
      delete lobby.assignments[assignee]
    }
  }

  broadcastGameState(io, lobby)
}

export function setupWerBinIchSocketHandlers(io: SocketIOServer) {
  io.on('connection', (socket: Socket) => {
    socket.on('lobby:create', (name: string, callback?: (payload: AckPayload) => void) => {
      if (!name || typeof name !== 'string' || name.trim().length === 0) {
        callback?.({ error: 'Name darf nicht leer sein.' })
        return
      }

      const lobby = createLobby(socket, name.trim())
      socket.join(lobby.code)
      broadcastLobby(io, lobby)
      callback?.({ code: lobby.code })
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

        lobby.players.push({ id: socket.id, name: name.trim(), isHost: false })
        socket.join(lobby.code)
        broadcastLobby(io, lobby)
        callback?.({ code: lobby.code })
      }
    )

    socket.on('game:start', (callback?: (payload: AckPayload) => void) => {
      const lobby = findLobbyByPlayer(socket.id)
      if (!lobby) {
        callback?.({ error: 'Lobby nicht gefunden.' })
        return
      }

      const player = lobby.players.find(entry => entry.id === socket.id)
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
        const lobby = findLobbyByPlayer(socket.id)
        if (!lobby) {
          callback?.({ error: 'Lobby nicht gefunden.' })
          return
        }

        const word = payload?.word?.trim()
        if (!word) {
          callback?.({ error: 'Wort darf nicht leer sein.' })
          return
        }

        const targetId = lobby.assignments[socket.id]
        if (!targetId) {
          callback?.({ error: 'Kein Ziel zugewiesen.' })
          return
        }

        lobby.words[targetId] = { word, authorId: socket.id }
        callback?.({ ok: true })

        if (checkAllWordsWritten(lobby)) {
          lobby.state = 'playing'
        }
        broadcastGameState(io, lobby)
      }
    )

    socket.on('game:solve', (callback?: (payload: AckPayload) => void) => {
      const lobby = findLobbyByPlayer(socket.id)
      if (!lobby || lobby.state !== 'playing') {
        callback?.({ error: 'Spiel läuft nicht.' })
        return
      }

      const wordEntry = lobby.words[socket.id]
      if (!wordEntry) {
        callback?.({ error: 'Kein Wort vorhanden.' })
        return
      }

      lobby.solved[socket.id] = true
      const author = lobby.players.find(player => player.id === wordEntry.authorId)
      lobby.solvedInfo[socket.id] = {
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
        const lobby = findLobbyByPlayer(socket.id)
        if (!lobby || lobby.state !== 'playing') {
          callback?.({ error: 'Spiel läuft nicht.' })
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
        if (targetId === socket.id) {
          callback?.({ error: 'Du kannst dir nicht selbst ein Wort geben.' })
          return
        }

        lobby.words[targetId] = { word, authorId: socket.id }
        lobby.solved[targetId] = false
        lobby.solvedInfo[targetId] = null

        broadcastGameState(io, lobby)
        callback?.({ ok: true })
      }
    )

    socket.on('lobby:leave', () => {
      handleDisconnect(io, socket)
    })

    socket.on('lobby:close', () => {
      const lobby = findLobbyByPlayer(socket.id)
      if (!lobby) return
      const player = lobby.players.find(entry => entry.id === socket.id)
      if (!player?.isHost) return

      lobby.players.forEach(entry => {
        io.to(entry.id).emit('lobby:closed')
      })
      werBinIchLobbies.delete(lobby.code)
    })

    socket.on('disconnect', () => {
      handleDisconnect(io, socket)
    })
  })
}
