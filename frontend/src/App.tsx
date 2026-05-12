import { useEffect, useState } from 'react'
import { io, Socket } from 'socket.io-client'
import GamePortal from './pages/GamePortal'
import LobbyScreen from './pages/LobbyScreen'
import GameScreen from './pages/GameScreen'
import GameSetup from './pages/GameSetup'
import ArchiveScreen from './pages/ArchiveScreen'
import { useGameSocket } from './hooks/useGameSocket'
import './styles/globals.css'

export type PageType = 'portal' | 'menu' | 'lobby' | 'setup' | 'game' | 'archive' | 'werbinich'

interface AppState {
  currentPage: PageType
  socket: Socket | null
  sessionId: string | null
}

// Read a lobby code from the URL query string (e.g. `?code=ABC123`) so that
// invite links can drop users directly into the join form.
const readInviteCode = (): string => {
  if (typeof window === 'undefined') return ''
  const params = new URLSearchParams(window.location.search)
  const code = (params.get('code') || '').trim().toUpperCase()
  return /^[A-Z0-9]{4,8}$/.test(code) ? code : ''
}

function App() {
  const [appState, setAppState] = useState<AppState>({
    currentPage: 'portal',
    socket: null,
    sessionId: null
  })
  const game = useGameSocket(appState.socket)
  const { gameState, kickedReason, clearKickedReason } = game
  const [inviteCode, setInviteCode] = useState<string>(() => readInviteCode())

  useEffect(() => {
    const socket = io(import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000', {
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 5,
      transports: ['websocket', 'polling']
    })

    socket.on('connect', () => {
      console.log('Connected to server')
      setAppState((prev: AppState) => ({ ...prev, socket, sessionId: socket.id ?? null }))
      // Per-tab session data (lobby + player identity) lives in sessionStorage
      // so each tab stays an independent client. The nickname is kept in
      // localStorage as a user preference.
      const savedCode = sessionStorage.getItem('cypher-lobby-code')
      const savedNickname = localStorage.getItem('cypher-nickname')
      const savedPlayerId = sessionStorage.getItem('cypher-player-id')
      if (savedCode && savedNickname && savedPlayerId) {
        socket.emit('join-lobby', savedCode, savedNickname, savedPlayerId)
      }
    })

    socket.on('disconnect', () => {
      console.log('Disconnected from server')
    })

    const handleLobbyClosed = () => {
      sessionStorage.removeItem('cypher-lobby-code')
      sessionStorage.removeItem('cypher-game-state')
      sessionStorage.removeItem('cypher-round-prompt')
      sessionStorage.removeItem('cypher-player-id')
      localStorage.removeItem('cypher-nickname')
      setAppState((prev: AppState) => ({ ...prev, currentPage: 'menu' }))
    }

    socket.on('lobby-closed', handleLobbyClosed)

    return () => {
      socket.off('lobby-closed', handleLobbyClosed)
      socket.disconnect()
    }
  }, [])

  useEffect(() => {
    if (!gameState) return
    if (appState.currentPage !== 'menu') return
    if ((gameState.gameStarted && !gameState.gameEnded) || gameState.votingActive) {
      setAppState((prev: AppState) => ({ ...prev, currentPage: 'game' }))
      return
    }
    setAppState((prev: AppState) => ({ ...prev, currentPage: 'setup' }))
  }, [appState.currentPage, gameState])

  // When the player is kicked we want to bounce them back to the landing page
  // so they can see the banner and join a different lobby.
  useEffect(() => {
    if (kickedReason) {
      setAppState((prev: AppState) => ({ ...prev, currentPage: 'menu' }))
    }
  }, [kickedReason])

  const navigateTo = (page: PageType) => {
    setAppState((prev: AppState) => ({ ...prev, currentPage: page }))
  }

  const consumeInviteCode = () => {
    setInviteCode('')
    // Also strip the ?code= from the URL so that refreshing the page doesn't
    // keep popping users back into the join form.
    if (typeof window !== 'undefined' && window.history?.replaceState) {
      const url = new URL(window.location.href)
      url.searchParams.delete('code')
      window.history.replaceState({}, '', url.toString())
    }
  }

  return (
    <div className="min-h-screen text-white overflow-x-hidden">
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.09),transparent_30%),radial-gradient(circle_at_bottom_right,rgba(255,255,255,0.05),transparent_28%)]" />
        <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-white/5 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-white/5 to-transparent" />
      </div>

      <div className="relative z-10">
        {kickedReason && (
          <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-3 bg-red-600 text-white rounded-lg shadow-lg border border-red-400 flex items-center gap-3 max-w-md">
            <span className="text-sm">Du wurdest entfernt: {kickedReason}</span>
            <button
              onClick={clearKickedReason}
              className="text-white/90 hover:text-white text-xs underline"
            >
              Schliessen
            </button>
          </div>
        )}

        {appState.currentPage === 'portal' && (
          <GamePortal
            onNavigate={(game) => {
              if (game === 'cypher') {
                setAppState((prev: AppState) => ({ ...prev, currentPage: 'menu' }))
              } else if (game === 'werbinich') {
                // Navigate to Wer bin ich (external link or embedded component)
                window.location.href = 'https://werbinich-production.up.railway.app'
              }
            }}
          />
        )}
        {appState.currentPage === 'menu' && (
          <LobbyScreen
            socket={appState.socket}
            onNavigate={navigateTo}
            game={game}
            inviteCode={inviteCode}
            onInviteCodeConsumed={consumeInviteCode}
          />
        )}
        {appState.currentPage === 'setup' && (
          <GameSetup socket={appState.socket} onNavigate={navigateTo} game={game} />
        )}
        {appState.currentPage === 'game' && (
          <GameScreen socket={appState.socket} onNavigate={navigateTo} game={game} />
        )}
        {appState.currentPage === 'archive' && (
          <ArchiveScreen onNavigate={navigateTo} />
        )}
      </div>
    </div>
  )
}

export default App
