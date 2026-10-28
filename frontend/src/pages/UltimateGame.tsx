import { useEffect, useRef, useState } from 'react'
import { io, Socket } from 'socket.io-client'
import MainMenu from '../games/ultimate/MainMenu'
import Lobby from '../games/ultimate/Lobby'
import Game from '../games/ultimate/Game'
import type { UltimateAck, UltimateSession, UltimateState } from '../games/ultimate/types'
import '../styles/globals.css'
import '../games/ultimate/zeitung.css'

const SESSION_STORAGE_KEY = 'ultimate:session'
// Gleicher Wert wie in backend/src/ultimate.ts. Laeuft die Anzeige dem Server
// davon, zeigt sie ein Fenster als abgelaufen, das noch offen ist.
const RECONNECT_GRACE_MS = 5 * 60_000

const readStoredSession = (): UltimateSession | null => {
  if (typeof window === 'undefined') return null

  const raw = localStorage.getItem(SESSION_STORAGE_KEY)
  if (!raw) return null

  try {
    return JSON.parse(raw) as UltimateSession
  } catch {
    localStorage.removeItem(SESSION_STORAGE_KEY)
    return null
  }
}

export default function UltimateGame() {
  useEffect(() => {
    document.title = 'TikTacToe Ultimate'
  }, [])

  // Die Zeitungsoptik braucht einen hellen Untergrund. globals.css legt auf
  // body einen dunklen Verlauf und zwei fixierte Overlays; beides wird ueber
  // diese Klasse abgeschaltet und beim Verlassen wieder freigegeben.
  useEffect(() => {
    document.body.classList.add('zt-body')
    return () => document.body.classList.remove('zt-body')
  }, [])

  const initialSession = readStoredSession()
  const [socket, setSocket] = useState<Socket | null>(null)
  const [socketConnected, setSocketConnected] = useState(false)
  const [state, setState] = useState<UltimateState | null>(null)
  const [session, setSession] = useState<UltimateSession | null>(initialSession)
  const [error, setError] = useState('')
  const [reconnecting, setReconnecting] = useState(false)
  const [reconnectSecondsLeft, setReconnectSecondsLeft] = useState(0)

  const sessionRef = useRef<UltimateSession | null>(initialSession)
  // Die Socket-Handler werden einmal registriert und koennen den State nicht
  // mitlesen. Dieser Ref haelt fest, ob eine Partie laeuft — davon haengt ab,
  // ob das Reconnect-Fenster befristet ist.
  const gameRunningRef = useRef(false)

  const persistSession = (nextSession: UltimateSession | null) => {
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
      // Unbegrenzt: ein Kaltstart der Render-Instanz dauert rund 50 Sekunden.
      // Mit den fruehreren fuenf Versuchen gab der Client nach etwa 25
      // Sekunden auf und niemand kam mehr zurueck in seine Lobby.
      reconnectionAttempts: Infinity,
      transports: ['websocket', 'polling']
    })

    const attemptResume = (socketToUse: Socket) => {
      const current = sessionRef.current
      if (!current?.reconnectKey || !current.lobbyCode) return

      setReconnecting(true)
      socketToUse.emit('ttt:session:resume', current.reconnectKey, current.lobbyCode, (response?: UltimateAck) => {
        setReconnecting(false)
        if (response?.error) {
          persistSession(null)
          setState(null)
          setError(response.error)
          return
        }
        if (response?.session) {
          persistSession({ ...response.session, reconnectDeadline: null })
        }
      })
    }

    const handleState = (data: UltimateState) => {
      setState(data)
      gameRunningRef.current = data.phase !== 'waiting'

      const current = sessionRef.current
      const me = data.players.find(player => player.id === current?.playerId)
      if (current && me) {
        persistSession({
          ...current,
          playerName: me.name,
          reconnectDeadline: me.reconnectDeadline
        })
      }

      setError('')
      setReconnecting(false)
    }

    const handleClosed = () => {
      setState(null)
      persistSession(null)
      gameRunningRef.current = false
      setError('Der Tisch wurde aufgelöst.')
      setReconnecting(false)
    }

    const handleKicked = (reason: string) => {
      setState(null)
      persistSession(null)
      gameRunningRef.current = false
      setError(reason || 'Du wurdest vom Tisch gebeten.')
      setReconnecting(false)
    }

    const handleDisconnect = () => {
      setSocketConnected(false)
      setReconnecting(false)

      const current = sessionRef.current
      if (!current) {
        setError('Verbindung zum Server verloren.')
        return
      }

      const keepSeat = gameRunningRef.current
      persistSession({
        ...current,
        reconnectDeadline: keepSeat ? null : Date.now() + RECONNECT_GRACE_MS
      })
      setError(
        keepSeat
          ? 'Verbindung verloren. Dein Platz bleibt frei, solange die Partie läuft.'
          : 'Verbindung verloren. Die Session wird wiederhergestellt.'
      )
    }

    newSocket.on('connect', () => {
      setSocket(newSocket)
      setSocketConnected(true)
      setError('')

      if (sessionRef.current?.reconnectKey && sessionRef.current?.lobbyCode) {
        attemptResume(newSocket)
      }
    })

    newSocket.on('ttt:state', handleState)
    newSocket.on('ttt:lobby:closed', handleClosed)
    newSocket.on('ttt:lobby:kicked', handleKicked)
    newSocket.on('disconnect', handleDisconnect)

    return () => {
      newSocket.off('ttt:state', handleState)
      newSocket.off('ttt:lobby:closed', handleClosed)
      newSocket.off('ttt:lobby:kicked', handleKicked)
      newSocket.off('disconnect', handleDisconnect)
      newSocket.close()
    }
  }, [])

  useEffect(() => {
    if (!session?.reconnectDeadline) {
      setReconnectSecondsLeft(0)
      return
    }

    const update = () => {
      const seconds = Math.max(0, Math.ceil((session.reconnectDeadline! - Date.now()) / 1000))
      setReconnectSecondsLeft(seconds)
      if (seconds === 0) persistSession(null)
    }

    update()
    const timer = window.setInterval(update, 1000)
    return () => window.clearInterval(timer)
  }, [session])

  const leaveToMenu = () => {
    setState(null)
    persistSession(null)
    gameRunningRef.current = false
    setError('')
  }

  if (!socket || !socketConnected) {
    return (
      <div className="zt-page">
        <div className="zt-sheet">
          <header className="zt-masthead">
            <div className="zt-masthead-line">
              <span>Iryo Game Collection</span>
              <span>Druckerei</span>
            </div>
            <h1 className="zt-title">TikTacToe Ultimate</h1>
            <p className="zt-subtitle">
              {reconnecting ? 'Session wird wiederhergestellt' : 'Verbindung zum Server wird aufgebaut'}
            </p>
          </header>

          <p className="zt-note" style={{ marginTop: '1.2rem' }}>
            Der Server schläft im Leerlauf ein und braucht beim ersten Aufruf
            rund eine Minute, bis er wieder da ist. Die Seite verbindet sich von
            allein weiter.
          </p>

          {session?.reconnectDeadline && reconnectSecondsLeft > 0 && (
            <p className="zt-kicker" style={{ marginTop: '0.8rem' }}>
              Reconnect-Fenster noch {reconnectSecondsLeft} Sekunden offen
            </p>
          )}
          {session?.reconnectKey && !session.reconnectDeadline && (
            <p className="zt-kicker" style={{ marginTop: '0.8rem' }}>
              Dein Platz bleibt frei, solange die Partie läuft
            </p>
          )}
          {error && <p className="zt-note" style={{ marginTop: '0.8rem' }}>{error}</p>}
        </div>
      </div>
    )
  }

  if (!session || !state) {
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

  if (state.phase === 'waiting' || !state.match) {
    return (
      <Lobby
        socket={socket}
        state={state}
        selfPlayerId={session.playerId}
        error={error}
        onError={setError}
        onLeave={leaveToMenu}
      />
    )
  }

  return (
    <Game
      socket={socket}
      state={state}
      match={state.match}
      selfPlayerId={session.playerId}
      error={error}
      onError={setError}
    />
  )
}
