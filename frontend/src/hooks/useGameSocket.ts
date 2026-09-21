import { useEffect, useState, useCallback, useRef } from 'react'
import { Socket } from 'socket.io-client'
import { GameState, VoteKickResult, VoteKickState } from '../../../shared/types'

export interface GameSocketApi {
  gameState: GameState | null
  error: string
  loading: boolean
  kickedReason: string
  voteKick: VoteKickState | null
  voteKickNotice: string
  startVoteKick: (targetId: string) => void
  castVoteKickVote: (approve: boolean) => void
  clearVoteKickNotice: () => void
  joinLobby: (code: string, nickname: string) => void
  createLobby: (nickname: string, playerCount: number, timerEnabled: boolean, timerSeconds: number) => void
  submitText: (text: string) => void
  submitVote: (textIndex: number) => void
  leaveLobby: () => void
  closeLobby: () => void
  kickPlayer: (playerId: string) => void
  transferHost: (newHostId: string) => void
  clearSession: () => void
  clearKickedReason: () => void
  startGame: () => void
  socket: Socket | null
}

const PLAYER_ID_KEY = 'cypher-player-id'
const NICKNAME_KEY = 'cypher-nickname'
const LOBBY_CODE_KEY = 'cypher-lobby-code'
const GAME_STATE_KEY = 'cypher-game-state'
const ROUND_PROMPT_KEY = 'cypher-round-prompt'

const getOrCreatePlayerId = () => {
  // Use sessionStorage so each browser tab gets its own identity. localStorage
  // would be shared across tabs, which breaks multi-instance testing (every
  // tab would reuse the same player id and the backend would treat them as a
  // single player).
  const existing = sessionStorage.getItem(PLAYER_ID_KEY)
  if (existing) return existing
  const generated = (globalThis.crypto && 'randomUUID' in globalThis.crypto)
    ? globalThis.crypto.randomUUID()
    : `${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`
  sessionStorage.setItem(PLAYER_ID_KEY, generated)
  return generated
}

export function useGameSocket(socket: Socket | null): GameSocketApi {
  const [gameState, setGameState] = useState<GameState | null>(null)
  const [error, setError] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [kickedReason, setKickedReason] = useState<string>('')
  const [voteKick, setVoteKick] = useState<VoteKickState | null>(null)
  const [voteKickNotice, setVoteKickNotice] = useState<string>('')
  const gameStateRef = useRef<GameState | null>(null)

  const clearSession = useCallback(() => {
    setGameState(null)
    setLoading(false)
    setError('')
    setVoteKick(null)
    gameStateRef.current = null
    sessionStorage.removeItem(LOBBY_CODE_KEY)
    sessionStorage.removeItem(GAME_STATE_KEY)
    sessionStorage.removeItem(ROUND_PROMPT_KEY)
    sessionStorage.removeItem(PLAYER_ID_KEY)
    localStorage.removeItem(NICKNAME_KEY)
  }, [])

  // Listen to socket events
  useEffect(() => {
    if (!socket) return

    socket.on('lobby-joined', (state: GameState) => {
      setError('')
      setGameState(state)
      gameStateRef.current = state
      setLoading(false)
      if (state?.lobbyCode) {
        sessionStorage.setItem(LOBBY_CODE_KEY, state.lobbyCode)
      }
    })

    socket.on('lobby-created', (code: string, state: GameState) => {
      console.log('Lobby created:', code)
      setError('')
      setGameState(state)
      gameStateRef.current = state
      setLoading(false)
      if (code) {
        sessionStorage.setItem(LOBBY_CODE_KEY, code)
      }
    })

    socket.on('state-update', (state: GameState) => {
      setError('')
      setGameState(state)
      gameStateRef.current = state
      setLoading(false)
      if (state?.lobbyCode) {
        sessionStorage.setItem(LOBBY_CODE_KEY, state.lobbyCode)
      }
    })

    socket.on('lobby-closed', () => {
      clearSession()
    })

    socket.on('votekick:state', (state: VoteKickState | null) => {
      setVoteKick(state)
    })

    socket.on('votekick:result', ({ targetName, outcome }: VoteKickResult) => {
      setVoteKick(null)
      if (outcome === 'cancelled') return
      setVoteKickNotice(
        outcome === 'passed'
          ? `${targetName} wurde per Abstimmung entfernt.`
          : `Die Abstimmung über ${targetName} ist gescheitert.`
      )
    })

    socket.on('kicked', (reason: string) => {
      setKickedReason(reason || 'Du wurdest aus der Lobby entfernt.')
      clearSession()
    })

    socket.on('error', (message: string) => {
      setError(message)
      setLoading(false)
      console.error('Socket error:', message)
      if (message.toLowerCase().includes('lobby not found') || message.toLowerCase().includes('lobby nicht gefunden')) {
        if (!gameStateRef.current) {
          setGameState(null)
          setLoading(false)
          sessionStorage.removeItem(LOBBY_CODE_KEY)
          sessionStorage.removeItem(ROUND_PROMPT_KEY)
          sessionStorage.removeItem(PLAYER_ID_KEY)
          localStorage.removeItem(NICKNAME_KEY)
        }
      }
    })

    socket.on('connect_error', (err: Error) => {
      setError('Verbindung zum Server fehlgeschlagen')
      setLoading(false)
      console.error('Connection error:', err)
    })

    return () => {
      socket.off('lobby-joined')
      socket.off('lobby-created')
      socket.off('state-update')
      socket.off('lobby-closed')
      socket.off('votekick:state')
      socket.off('votekick:result')
      socket.off('kicked')
      socket.off('error')
      socket.off('connect_error')
    }
  }, [socket, clearSession])

  const joinLobby = useCallback((code: string, nickname: string) => {
    if (!socket?.connected) {
      setError('Nicht mit Server verbunden')
      return
    }
    setError('')
    setLoading(true)
    const playerId = getOrCreatePlayerId()
    localStorage.setItem(NICKNAME_KEY, nickname)
    socket.emit('join-lobby', code, nickname, playerId)
  }, [socket])

  const createLobby = useCallback((nickname: string, playerCount: number, timerEnabled: boolean, timerSeconds: number) => {
    if (!socket?.connected) {
      setError('Nicht mit Server verbunden')
      return
    }
    setError('')
    setLoading(true)
    const playerId = getOrCreatePlayerId()
    localStorage.setItem(NICKNAME_KEY, nickname)
    socket.emit('create-lobby', { playerCount, timerEnabled, timerSeconds }, nickname, playerId)
  }, [socket])

  const submitText = useCallback((text: string) => {
    if (!socket?.connected) {
      setError('Nicht mit Server verbunden')
      return
    }
    socket.emit('submit-text', text)
  }, [socket])

  const submitVote = useCallback((textIndex: number) => {
    if (!socket?.connected) {
      setError('Nicht mit Server verbunden')
      return
    }
    socket.emit('submit-vote', textIndex)
  }, [socket])

  const leaveLobby = useCallback(() => {
    if (!socket?.connected) {
      setError('Nicht mit Server verbunden')
      return
    }
    socket.emit('leave-lobby')
  }, [socket])

  const closeLobby = useCallback(() => {
    if (!socket?.connected) {
      setError('Nicht mit Server verbunden')
      return
    }
    socket.emit('close-lobby')
  }, [socket])

  const startGame = useCallback(() => {
    if (!socket?.connected) {
      setError('Nicht mit Server verbunden')
      return
    }
    socket.emit('start-game')
  }, [socket])

  const kickPlayer = useCallback((targetId: string) => {
    if (!socket?.connected) {
      setError('Nicht mit Server verbunden')
      return
    }
    socket.emit('kick-player', targetId)
  }, [socket])

  const transferHost = useCallback((newHostId: string) => {
    if (!socket?.connected) {
      setError('Nicht mit Server verbunden')
      return
    }
    socket.emit('transfer-host', newHostId)
  }, [socket])

  const startVoteKick = useCallback((targetId: string) => {
    if (!socket?.connected) {
      setError('Nicht mit Server verbunden')
      return
    }
    socket.emit('votekick:start', targetId)
  }, [socket])

  const castVoteKickVote = useCallback((approve: boolean) => {
    if (!socket?.connected) {
      setError('Nicht mit Server verbunden')
      return
    }
    socket.emit('votekick:vote', approve)
  }, [socket])

  const clearKickedReason = useCallback(() => {
    setKickedReason('')
  }, [])

  const clearVoteKickNotice = useCallback(() => {
    setVoteKickNotice('')
  }, [])

  return {
    gameState,
    error,
    loading,
    kickedReason,
    voteKick,
    voteKickNotice,
    startVoteKick,
    castVoteKickVote,
    clearVoteKickNotice,
    joinLobby,
    createLobby,
    submitText,
    submitVote,
    leaveLobby,
    closeLobby,
    kickPlayer,
    transferHost,
    clearSession,
    clearKickedReason,
    startGame,
    socket
  }
}
