import { useEffect, useRef, useState } from 'react'
import { io, Socket } from 'socket.io-client'
import MainMenu from '../games/wavvelength/MainMenu'
import Lobby from '../games/wavvelength/Lobby'
import VotingScreen from '../games/wavvelength/VotingScreen'
import Game from '../games/wavvelength/Game'
import ResultScreen from '../games/wavvelength/ResultScreen'
import type {
  WavvelengthAck,
  WavvelengthGameState,
  WavvelengthLobbyState,
  WavvelengthSession,
  WavvelengthScreen
} from '../games/wavvelength/types'
import '../styles/globals.css'

const SESSION_STORAGE_KEY = 'wavvelength:session'
const RECONNECT_GRACE_MS = 120_000

const readStoredSession = (): WavvelengthSession | null => {
  if (typeof window === 'undefined') return null

  const raw = localStorage.getItem(SESSION_STORAGE_KEY)
  if (!raw) return null

  try {
    return JSON.parse(raw) as WavvelengthSession
  } catch {
    localStorage.removeItem(SESSION_STORAGE_KEY)
    return null
  }
}

export default function WavvelengthGame() {
  useEffect(() => {
    document.title = 'Wavelength'
  }, [])

  const initialSession = readStoredSession()
  const [screen, setScreen] = useState<WavvelengthScreen>('menu')
  const [socket, setSocket] = useState<Socket | null>(null)
  const [socketConnected, setSocketConnected] = useState(false)
  const [lobbyData, setLobbyData] = useState<WavvelengthLobbyState | null>(null)
  const [gameData, setGameData] = useState<WavvelengthGameState | null>(null)
  const [session, setSession] = useState<WavvelengthSession | null>(initialSession)
  const [error, setError] = useState('')
  const [reconnecting, setReconnecting] = useState(false)
  const [reconnectSecondsLeft, setReconnectSecondsLeft] = useState(0)
  const sessionRef = useRef<WavvelengthSession | null>(initialSession)

  const persistSession = (nextSession: WavvelengthSession | null) => {
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

    const syncSessionPlayer = (players: WavvelengthLobbyState['players']) => {
      const activeSession = sessionRef.current
      const me = players.find(player => player.id === activeSession?.playerId)
      if (!activeSession || !me) return

      persistSession({
        ...activeSession,
        playerName: me.name,
        reconnectDeadline: me.reconnectDeadline ?? null
      })
    }

    const handleLobbyUpdate = (data: WavvelengthLobbyState) => {
      setLobbyData(data)
      setGameData(null)
      syncSessionPlayer(data.players)
      setError('')
      setScreen('lobby')
      setReconnecting(false)
    }

    const handleVotingStarted = (data: WavvelengthLobbyState) => {
      setLobbyData(data)
      setGameData(null)
      syncSessionPlayer(data.players)
      setError('')
      setScreen('voting')
      setReconnecting(false)
    }

    const handleGameState = (data: WavvelengthGameState) => {
      setGameData(data)
      setLobbyData(null)
      syncSessionPlayer(data.players)
      setError('')
      setScreen('game')
      setReconnecting(false)
    }

    const handleResultState = (data: WavvelengthGameState) => {
      setGameData(data)
      setLobbyData(null)
      syncSessionPlayer(data.players)
      setError('')
      setScreen('result')
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
      setSocketConnected(false)
      setReconnecting(false)

      const activeSession = sessionRef.current
      if (activeSession) {
        persistSession({
          ...activeSession,
          reconnectDeadline: Date.now() + RECONNECT_GRACE_MS
        })
        setError('Verbindung zum Server verloren. Wir versuchen, deine Session wiederherzustellen.')
        return
      }

      setError('Verbindung zum Server verloren.')
    }

    newSocket.on('connect', () => {
      setSocket(newSocket)
      setSocketConnected(true)
      setError('')

      if (sessionRef.current?.reconnectKey && sessionRef.current?.lobbyCode) {
        attemptSessionResume(newSocket)
      }
    })

    newSocket.on('wvl:lobby:update', handleLobbyUpdate)
    newSocket.on('wvl:voting:started', handleVotingStarted)
    newSocket.on('wvl:game:state', handleGameState)
    newSocket.on('wvl:result:state', handleResultState)
    newSocket.on('wvl:lobby:closed', handleLobbyClosed)
    newSocket.on('disconnect', handleDisconnect)

    return () => {
      newSocket.off('wvl:lobby:update', handleLobbyUpdate)
      newSocket.off('wvl:voting:started', handleVotingStarted)
      newSocket.off('wvl:game:state', handleGameState)
      newSocket.off('wvl:result:state', handleResultState)
      newSocket.off('wvl:lobby:closed', handleLobbyClosed)
      newSocket.off('disconnect', handleDisconnect)
      newSocket.close()
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

  const attemptSessionResume = (socketToUse: Socket) => {
    const currentSession = sessionRef.current
    if (!currentSession?.reconnectKey || !currentSession.lobbyCode) return

    setReconnecting(true)
    socketToUse.emit('wvl:session:resume', currentSession.reconnectKey, currentSession.lobbyCode, (response?: WavvelengthAck) => {
      setReconnecting(false)
      if (response?.error) {
        persistSession(null)
        setScreen('menu')
        setError(response.error)
        return
      }
      if (response?.session) {
        persistSession({ ...response.session, reconnectDeadline: null })
      }
    })
  }

  const handleMenuClose = () => {
    setScreen('menu')
    setLobbyData(null)
    setGameData(null)
    persistSession(null)
    setError('')
    setReconnecting(false)
  }

  if (!socket || !socketConnected) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-900 px-4">
        <div className="text-center space-y-4 max-w-xl">
          <h1 className="text-4xl font-bold text-white">Wavelength</h1>
          <p className="text-white/70">
            {reconnecting ? 'Stelle deine Session wieder her...' : 'Verbinde mit dem Server...'}
          </p>
          {session?.reconnectDeadline && reconnectSecondsLeft > 0 && (
            <p className="text-sm text-zinc-500">
              Reconnect-Fenster offen für noch {reconnectSecondsLeft} Sekunden.
            </p>
          )}
        </div>
      </div>
    )
  }

  if (screen === 'menu') {
    return (
      <MainMenu
        socket={socket}
        onSession={nextSession => {
          persistSession(nextSession)
          setError('')
        }}
        error={error}
        onError={setError}
        clearError={() => setError('')}
      />
    )
  }

  if (screen === 'lobby' && lobbyData) {
    return (
      <Lobby
        socket={socket}
        lobby={lobbyData}
        selfPlayerId={session?.playerId ?? null}
        error={error}
        onError={setError}
        onLeave={handleMenuClose}
      />
    )
  }

  if (screen === 'voting' && lobbyData) {
    return (
      <VotingScreen
        socket={socket}
        lobby={lobbyData}
        selfPlayerId={session?.playerId ?? null}
        onError={setError}
      />
    )
  }

  if (screen === 'game' && gameData) {
    return <Game socket={socket} gameState={gameData} onError={setError} />
  }

  if (screen === 'result' && gameData) {
    return <ResultScreen socket={socket} gameState={gameData} onError={setError} />
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-900 px-4">
      <div className="text-center space-y-4">
        <p className="text-white/70">Lade...</p>
      </div>
    </div>
  )
}
