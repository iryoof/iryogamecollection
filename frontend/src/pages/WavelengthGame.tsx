import { useEffect, useRef, useState } from 'react'
import { io, Socket } from 'socket.io-client'
import MainMenu from '../games/wavelength/MainMenu'
import Lobby from '../games/wavelength/Lobby'
import VotingScreen from '../games/wavelength/VotingScreen'
import Game from '../games/wavelength/Game'
import ResultScreen from '../games/wavelength/ResultScreen'
import type {
  WavelengthAck,
  WavelengthGameState,
  WavelengthLobbyState,
  WavelengthSession,
  WavelengthScreen
} from '../games/wavelength/types'
import { useVoteKick } from '../hooks/useVoteKick'
import '../styles/globals.css'

// Keeps the historical (misspelled) key so sessions that were stored before the
// rename can still be reconnected after a deploy.
const SESSION_STORAGE_KEY = 'wavvelength:session'
const RECONNECT_GRACE_MS = 120_000

const readStoredSession = (): WavelengthSession | null => {
  if (typeof window === 'undefined') return null

  const raw = localStorage.getItem(SESSION_STORAGE_KEY)
  if (!raw) return null

  try {
    return JSON.parse(raw) as WavelengthSession
  } catch {
    localStorage.removeItem(SESSION_STORAGE_KEY)
    return null
  }
}

export default function WavelengthGame() {
  useEffect(() => {
    document.title = 'Wavelength'
  }, [])

  const initialSession = readStoredSession()
  const [screen, setScreen] = useState<WavelengthScreen>('menu')
  const [socket, setSocket] = useState<Socket | null>(null)
  const [socketConnected, setSocketConnected] = useState(false)
  const [lobbyData, setLobbyData] = useState<WavelengthLobbyState | null>(null)
  const [gameData, setGameData] = useState<WavelengthGameState | null>(null)
  const [session, setSession] = useState<WavelengthSession | null>(initialSession)
  const [error, setError] = useState('')
  const [reconnecting, setReconnecting] = useState(false)
  const [reconnectSecondsLeft, setReconnectSecondsLeft] = useState(0)
  const sessionRef = useRef<WavelengthSession | null>(initialSession)
  // The socket handlers below are registered once, so they cannot read the
  // `screen` state directly. This ref mirrors whether the lobby has left the
  // waiting room, which decides if the reconnect window is limited or open.
  const gameRunningRef = useRef(false)
  const voteKickApi = useVoteKick(socket, 'wvl:', setError)

  const persistSession = (nextSession: WavelengthSession | null) => {
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

    const syncSessionPlayer = (players: WavelengthLobbyState['players']) => {
      const activeSession = sessionRef.current
      const me = players.find(player => player.id === activeSession?.playerId)
      if (!activeSession || !me) return

      persistSession({
        ...activeSession,
        playerName: me.name,
        reconnectDeadline: me.reconnectDeadline ?? null
      })
    }

    const handleLobbyUpdate = (data: WavelengthLobbyState) => {
      setLobbyData(data)
      setGameData(null)
      gameRunningRef.current = false
      syncSessionPlayer(data.players)
      setError('')
      setScreen('lobby')
      setReconnecting(false)
    }

    const handleVotingStarted = (data: WavelengthLobbyState) => {
      setLobbyData(data)
      setGameData(null)
      gameRunningRef.current = true
      syncSessionPlayer(data.players)
      setError('')
      setScreen('voting')
      setReconnecting(false)
    }

    const handleGameState = (data: WavelengthGameState) => {
      setGameData(data)
      setLobbyData(null)
      gameRunningRef.current = true
      syncSessionPlayer(data.players)
      setError('')
      setScreen('game')
      setReconnecting(false)
    }

    const handleResultState = (data: WavelengthGameState) => {
      setGameData(data)
      setLobbyData(null)
      gameRunningRef.current = true
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

    const handleKicked = (reason: string) => {
      setScreen('menu')
      setLobbyData(null)
      setGameData(null)
      persistSession(null)
      setError(reason || 'Du wurdest aus der Lobby entfernt.')
      setReconnecting(false)
    }

    const handleDisconnect = () => {
      setSocketConnected(false)
      setReconnecting(false)

      const activeSession = sessionRef.current
      if (activeSession) {
        const keepSeat = gameRunningRef.current
        persistSession({
          ...activeSession,
          reconnectDeadline: keepSeat ? null : Date.now() + RECONNECT_GRACE_MS
        })
        setError(
          keepSeat
            ? 'Verbindung zum Server verloren. Dein Platz bleibt frei, solange das Spiel läuft.'
            : 'Verbindung zum Server verloren. Wir versuchen, deine Session wiederherzustellen.'
        )
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
    newSocket.on('wvl:lobby:kicked', handleKicked)
    newSocket.on('disconnect', handleDisconnect)

    return () => {
      newSocket.off('wvl:lobby:update', handleLobbyUpdate)
      newSocket.off('wvl:voting:started', handleVotingStarted)
      newSocket.off('wvl:game:state', handleGameState)
      newSocket.off('wvl:result:state', handleResultState)
      newSocket.off('wvl:lobby:closed', handleLobbyClosed)
      newSocket.off('wvl:lobby:kicked', handleKicked)
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
    socketToUse.emit('wvl:session:resume', currentSession.reconnectKey, currentSession.lobbyCode, (response?: WavelengthAck) => {
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
          {session?.reconnectKey && !session.reconnectDeadline && (
            <p className="text-sm text-zinc-500">
              Dein Platz bleibt frei, solange das Spiel läuft.
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
        voteKick={voteKickApi}
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
        voteKick={voteKickApi}
      />
    )
  }

  if (screen === 'game' && gameData) {
    return <Game socket={socket} gameState={gameData} onError={setError} voteKick={voteKickApi} />
  }

  if (screen === 'result' && gameData) {
    return <ResultScreen socket={socket} gameState={gameData} onError={setError} voteKick={voteKickApi} />
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-900 px-4">
      <div className="text-center space-y-4">
        <p className="text-white/70">Lade...</p>
      </div>
    </div>
  )
}
