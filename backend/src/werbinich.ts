import { randomUUID } from 'node:crypto'
import { Server as SocketIOServer, Socket } from 'socket.io'
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
  // Null while connected, and also while disconnected during a running game —
  // there the seat is held without a deadline. Use isDisconnected for the flag.
  reconnectDeadline: number | null
  isDisconnected: boolean
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
    reconnectDeadline: null,
    isDisconnected: false
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
      isDisconnected: player.isDisconnected,
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

/**
 * Give a player who joined a running game somebody to write their word. The
 * assignment map holds exactly one target per author, so the newcomer is slotted
 * into the existing cycle instead of a second task being invented.
 */
function assignWordAuthorForLatecomer(lobby: WerBinIchLobby, newcomerId: string) {
  const others = lobby.players.filter(player => player.id !== newcomerId && !player.isDisconnected)
  if (others.length === 0) return

  // Best case: somebody whose own task is already done. Overwriting their
  // assignment costs nothing because the word they wrote is already stored.
  const finished = others.find(player => {
    const target = lobby.assignments[player.id]
    return !target || !!lobby.words[target]
  })
  if (finished) {
    lobby.assignments[finished.id] = newcomerId
    return
  }

  // Otherwise splice into the cycle: A now writes for the newcomer, and the
  // newcomer takes over A's old target. Neither word is lost, both are still
  // owed.
  const author = others[Math.floor(Math.random() * others.length)]
  const oldTarget = lobby.assignments[author.id]
  lobby.assignments[author.id] = newcomerId
  if (oldTarget) {
    lobby.assignments[newcomerId] = oldTarget
  }
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
        isDisconnected: otherPlayer.isDisconnected,
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
    // True for a latecomer until somebody has written a word for them.
    myWordPending: !lobby.words[player.id],
    // Also true while the game runs: a latecomer needs a word written for them
    // and whoever got that task must be prompted for it.
    needsToWrite: lobby.state !== 'waiting' && !targetWordExists,
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
      isDisconnected: otherPlayer.isDisconnected,
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
  if (!player || player.isDisconnected) return

  player.isDisconnected = true
  // Dropping out removes the player from the eligible voters, so an open vote
  // can tip over because of it.
  refreshVoteKick(lobby.code, true)

  // Once the game is running the seat is held without a deadline: the player
  // holds a word somebody else wrote for them, so evicting them mid-round would
  // throw that away. Only in the waiting room does the grace window apply.
  if (lobby.state === 'waiting') {
    player.reconnectDeadline = Date.now() + RECONNECT_GRACE_MS
    scheduleEviction(io, lobby.code, playerId)
  } else {
    player.reconnectDeadline = null
    cancelEviction(playerId)
  }

  if (lobby.state === 'waiting') {
    broadcastLobby(io, lobby)
    return
  }

  broadcastGameState(io, lobby)
}

function clearPlayerReconnectState(player: WerBinIchPlayer) {
  player.reconnectDeadline = null
  player.isDisconnected = false
  cancelEviction(player.id)
}

/**
 * Remove a player and tell them why. Shared by the host kick and the vote kick.
 */
async function evictPlayer(
  io: SocketIOServer,
  lobby: WerBinIchLobby,
  targetId: string,
  reason: string
): Promise<void> {
  // Take the target out of the lobby room before the roster broadcast, so a
  // late lobby:update cannot arrive after 'lobby:kicked' and put the kicked
  // client back on the lobby screen. The per-player room stays joined until
  // after the emit, otherwise the notice would go nowhere.
  const targetSockets = await io.in(targetId).fetchSockets()
  for (const targetSocket of targetSockets) {
    targetSocket.leave(lobby.code)
  }
  io.to(targetId).emit('lobby:kicked', reason)

  const code = lobby.code
  removePlayerFromLobby(io, lobby, targetId)
  if (!werBinIchLobbies.has(code)) {
    cancelVoteKick(code)
    return
  }
  // Cancel an open vote only if it was about the player who just left; for
  // anyone else the tally merely has one voter fewer.
  refreshVoteKick(code, !isVoteKickTarget(code, targetId))
}

/** Connected players who may vote on kicking `targetId`. */
function voteKickEligibleIds(lobbyCode: string, targetId: string): string[] {
  const lobby = werBinIchLobbies.get(lobbyCode)
  if (!lobby) return []
  return lobby.players
    .filter(player => player.id !== targetId && !player.isDisconnected)
    .map(player => player.id)
}

function handleVoteKickChange(io: SocketIOServer, lobbyCode: string, targetId: string, targetName: string) {
  return (state: VoteKickState | null, outcome: VoteKickOutcome | null) => {
    io.to(lobbyCode).emit('lobby:votekick:state', state)
    if (!outcome) return

    io.to(lobbyCode).emit('lobby:votekick:result', { targetName, outcome })
    if (outcome !== 'passed') return

    const lobby = werBinIchLobbies.get(lobbyCode)
    if (!lobby) return
    void evictPlayer(io, lobby, targetId, 'Die Lobby hat dich per Abstimmung entfernt.')
  }
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
        if (lobby.players.some(player => player.name.toLowerCase() === name.trim().toLowerCase())) {
          callback?.({ error: 'Dieser Name ist bereits vergeben.' })
          return
        }

        const player: WerBinIchPlayer = {
          id: randomUUID(),
          name: name.trim(),
          isHost: false,
          reconnectKey: randomUUID(),
          reconnectDeadline: null,
          isDisconnected: false
        }

        lobby.players.push(player)
        bindSocketToPlayer(socket, lobby, player)

        if (lobby.state === 'waiting') {
          broadcastLobby(io, lobby)
        } else {
          // Joining a running game: somebody gets the job of writing a word for
          // the newcomer, and everyone moves to the game view.
          assignWordAuthorForLatecomer(lobby, player.id)
          broadcastGameState(io, lobby)
        }
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

      // Coming back changes the eligible voter count, and the returning client
      // needs to see an open vote at all.
      refreshVoteKick(lobby.code, true)
      socket.emit('lobby:votekick:state', getVoteKick(lobby.code))

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

        if (lobby.state === 'writing' && checkAllWordsWritten(lobby)) {
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
      const code = lobby.code
      removePlayerFromLobby(io, lobby, playerId)
      if (!werBinIchLobbies.has(code)) {
        cancelVoteKick(code)
        return
      }
      refreshVoteKick(code, !isVoteKickTarget(code, playerId))
    })

    // Remove a specific player from the lobby (host only).
    socket.on('lobby:kick', async (targetId: string, callback?: (payload: AckPayload) => void) => {
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
        callback?.({ error: 'Nur der Host kann Spieler entfernen.' })
        return
      }
      if (!targetId || targetId === playerId) {
        callback?.({ error: 'Ungültiger Spieler.' })
        return
      }
      if (!lobby.players.some(entry => entry.id === targetId)) {
        callback?.({ error: 'Spieler nicht in der Lobby.' })
        return
      }

      await evictPlayer(io, lobby, targetId, 'Du wurdest aus der Lobby entfernt.')
      callback?.({ ok: true })
    })

    // Start a vote to kick a player. Open to every connected player, not only
    // the host, so a lobby can clear out a troublemaker on its own.
    socket.on('lobby:votekick:start', (targetId: string, callback?: (payload: AckPayload) => void) => {
      const playerId = socket.data.werBinIchPlayerId as string | undefined
      if (!playerId) {
        callback?.({ error: 'Session ungueltig.' })
        return
      }

      const lobby = findLobbyByPlayerId(playerId)
      if (!lobby) {
        callback?.({ error: 'Lobby nicht gefunden.' })
        return
      }

      const target = lobby.players.find(entry => entry.id === targetId)
      if (!target) {
        callback?.({ error: 'Spieler nicht in der Lobby.' })
        return
      }

      try {
        startVoteKick({
          lobbyCode: lobby.code,
          targetId,
          targetName: target.name,
          initiatorId: playerId,
          getEligibleIds: () => voteKickEligibleIds(lobby.code, targetId),
          onChange: handleVoteKickChange(io, lobby.code, targetId, target.name)
        })
        callback?.({ ok: true })
      } catch (error: any) {
        callback?.({ error: error.message })
      }
    })

    socket.on('lobby:votekick:vote', (approve: boolean, callback?: (payload: AckPayload) => void) => {
      const playerId = socket.data.werBinIchPlayerId as string | undefined
      if (!playerId) {
        callback?.({ error: 'Session ungueltig.' })
        return
      }

      const lobby = findLobbyByPlayerId(playerId)
      if (!lobby) {
        callback?.({ error: 'Lobby nicht gefunden.' })
        return
      }

      try {
        castVoteKickVote(lobby.code, playerId, approve)
        callback?.({ ok: true })
      } catch (error: any) {
        callback?.({ error: error.message })
      }
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
      cancelVoteKick(lobby.code)
      werBinIchLobbies.delete(lobby.code)
    })

    socket.on('game:end', () => {
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
      cancelVoteKick(lobby.code)
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
