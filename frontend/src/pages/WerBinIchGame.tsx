import { useEffect, useRef, useState } from 'react'
import { io, Socket } from 'socket.io-client'
import MainMenu from '../games/werbinich/MainMenu'
import Lobby from '../games/werbinich/Lobby'
import Game from '../games/werbinich/Game'
import type {
  WerBinIchAck,
  WerBinIchGameState,
  WerBinIchLobbyState,
  WerBinIchSession,
  WerBinIchScreen
} from '../games/werbinich/types'
import '../styles/globals.css'

const SESSION_STORAGE_KEY = 'werbinich:session'
const RECONNECT_GRACE_MS = 60_000

const readStoredSession = (): WerBinIchSession | null => {
  if (typeof window === 'undefined') return null

  const raw = localStorage.getItem(SESSION_STORAGE_KEY)
  if (!raw) return null

  try {
    return JSON.parse(raw) as WerBinIchSession
  } catch {
    localStorage.removeItem(SESSION_STORAGE_KEY)
    return null
  }
}

export default function WerBinIchGame() {
  useEffect(() => {
    document.title = 'Wer bin ich'
  }, [])

  const initialSession = readStoredSession()
  const [screen, setScreen] = useState<WerBinIchScreen>('menu')
  const [socket, setSocket] = useState<Socket | null>(null)
  const [lobbyData, setLobbyData] = useState<WerBinIchLobbyState | null>(null)
  const [gameData, setGameData] = useState<WerBinIchGameState | null>(null)
  const [session, setSession] = useState<WerBinIchSession | null>(initialSession)
  const [myName, setMyName] = useState(initialSession?.playerName || '')
  const [error, setError] = useState('')
  const [reconnecting, setReconnecting] = useState(false)
  const [reconnectSecondsLeft, setReconnectSecondsLeft] = useState(0)
  const sessionRef = useRef<WerBinIchSession | null>(initialSession)

  const persistSession = (nextSession: WerBinIchSession | null) => {
    sessionRef.current = nextSession
    setSession(nextSession)
    if (typeof window === 'undefined') return

    if (!nextSession) {
      localStorage.removeItem(SESSION_STORAGE_KEY)
      return
    }

    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(nextSession))
  }

  useEffect(() => {
    const newSocket = io(import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000', {
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 5,
      transports: ['websocket', 'polling']
    })

    const handleLobbyUpdate = (data: WerBinIchLobbyState) => {
      setLobbyData(data)
      const activeSession = sessionRef.current
      const me = data.players.find(player => player.id === activeSession?.playerId)
      if (activeSession && me) {
        persistSession({
          ...activeSession,
          playerName: me.name,
          lobbyCode: data.code,
          reconnectDeadline: me.reconnectDeadline ?? null
        })
      }
      setScreen('lobby')
      setReconnecting(false)
    }

    const handleGameState = (data: WerBinIchGameState) => {
      setGameData(data)
      const activeSession = sessionRef.current
      const me = data.players.find(player => player.id === activeSession?.playerId)
      if (activeSession && me) {
        persistSession({
          ...activeSession,
          playerName: me.name,
          reconnectDeadline: me.reconnectDeadline ?? null
        })
      }
      setScreen('game')
      setReconnecting(false)
    }

    const handleLobbyClosed = () => {
      setScreen('menu')
      setLobbyData(null)
      setGameData(null)
      persistSession(null)
      setError('Die Lobby wurde geschlossen.')
      setReconnecting(false)
    }

    const handleDisconnect = () => {
      setScreen('menu')
      setLobbyData(null)
      setGameData(null)
      setReconnecting(false)

      const activeSession = sessionRef.current
      if (activeSession) {
        persistSession({
          ...activeSession,
          reconnectDeadline: Date.now() + RECONNECT_GRACE_MS
        })
        setError('Verbindung zum Server verloren. Du kannst dich 60 Sekunden lang wiederverbinden.')
        return
      }

      setError('Verbindung zum Server verloren.')
    }

    newSocket.on('connect', () => {
      console.log('Wer bin ich verbunden')
      setSocket(newSocket)
      setError('')
    })

    newSocket.on('lobby:update', handleLobbyUpdate)
    newSocket.on('game:state', handleGameState)
    newSocket.on('lobby:closed', handleLobbyClosed)
    newSocket.on('disconnect', handleDisconnect)

    return () => {
      newSocket.off('lobby:update', handleLobbyUpdate)
      newSocket.off('game:state', handleGameState)
      newSocket.off('lobby:closed', handleLobbyClosed)
      newSocket.off('disconnect', handleDisconnect)
      newSocket.disconnect()
    }
  }, [])

  useEffect(() => {
    if (!session?.reconnectDeadline) {
      setReconnectSecondsLeft(0)
      return
    }

    const updateCountdown = () => {
      const seconds = Math.max(0, Math.ceil((session.reconnectDeadline! - Date.now()) / 1000))
      setReconnectSecondsLeft(seconds)
      if (seconds === 0) {
        persistSession(null)
      }
    }

    updateCountdown()
    const timer = window.setInterval(updateCountdown, 1000)
    return () => window.clearInterval(timer)
  }, [session])

  const handleCreate = (name: string) => {
    if (!socket) return
    setMyName(name)
    setError('')
    socket.emit('lobby:create', name, (response?: WerBinIchAck) => {
      if (response?.session) {
        persistSession({ ...response.session, reconnectDeadline: null })
      }
      if (response?.error) {
        setError(response.error)
      }
    })
  }

  const handleJoin = (name: string, code: string) => {
    if (!socket) return
    setMyName(name)
    setError('')
    socket.emit('lobby:join', { name, code }, (response?: WerBinIchAck) => {
      if (response?.session) {
        persistSession({ ...response.session, reconnectDeadline: null })
      }
      if (response?.error) {
        setError(response.error)
      }
    })
  }

  const handleReconnect = () => {
    if (!socket || !session?.reconnectKey) return
    if (!socket.connected) {
      socket.connect()
    }
    setReconnecting(true)
    setError('')
    socket.emit('session:resume', session.reconnectKey, (response?: WerBinIchAck) => {
      setReconnecting(false)
      if (response?.error) {
        persistSession(null)
        setError(response.error)
        return
      }
      if (response?.session) {
        setMyName(response.session.playerName)
        persistSession({ ...response.session, reconnectDeadline: null })
      }
    })
  }

  const handleLeave = () => {
    if (socket) {
      socket.emit('lobby:leave')
    }
    setScreen('menu')
    setLobbyData(null)
    setGameData(null)
    persistSession(null)
    setError('')
    setReconnecting(false)
  }

  return (
    <div className="min-h-screen text-white overflow-x-hidden">
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.08),transparent_32%),radial-gradient(circle_at_bottom_right,rgba(255,255,255,0.05),transparent_28%)]" />
        <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-white/5 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-white/5 to-transparent" />
      </div>

      <div className="relative z-10">
        {screen === 'menu' && (
          <MainMenu
            socketConnected={!!socket?.connected}
            socketAvailable={!!socket}
            onCreateLobby={handleCreate}
            onJoinLobby={handleJoin}
            onReconnect={handleReconnect}
            error={error}
            clearError={() => setError('')}
            reconnectAvailable={!!session?.reconnectDeadline && reconnectSecondsLeft > 0}
            reconnectSecondsLeft={reconnectSecondsLeft}
            reconnecting={reconnecting}
            reconnectPlayerName={session?.playerName}
            reconnectLobbyCode={session?.lobbyCode}
          />
        )}

        {screen === 'lobby' && socket && lobbyData && (
          <Lobby
            socket={socket}
            lobby={lobbyData}
            selfPlayerId={session?.playerId || null}
            error={error}
            onError={setError}
            onLeave={handleLeave}
          />
        )}

        {screen === 'game' && socket && gameData && (
          <Game
            socket={socket}
            game={gameData}
            myName={myName}
            onLeave={handleLeave}
          />
        )}
      </div>
    </div>
  )
}
