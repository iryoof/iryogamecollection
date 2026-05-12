import { useEffect, useState } from 'react'
import { io, Socket } from 'socket.io-client'
import MainMenu from '../games/werbinich/MainMenu'
import Lobby from '../games/werbinich/Lobby'
import Game from '../games/werbinich/Game'
import type {
  WerBinIchAck,
  WerBinIchGameState,
  WerBinIchLobbyState,
  WerBinIchScreen
} from '../games/werbinich/types'
import '../styles/globals.css'

export default function WerBinIchGame() {
  const [screen, setScreen] = useState<WerBinIchScreen>('menu')
  const [socket, setSocket] = useState<Socket | null>(null)
  const [lobbyData, setLobbyData] = useState<WerBinIchLobbyState | null>(null)
  const [gameData, setGameData] = useState<WerBinIchGameState | null>(null)
  const [myName, setMyName] = useState('')
  const [error, setError] = useState('')

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
      setScreen('lobby')
    }

    const handleGameState = (data: WerBinIchGameState) => {
      setGameData(data)
      setScreen('game')
    }

    const handleLobbyClosed = () => {
      setScreen('menu')
      setLobbyData(null)
      setGameData(null)
      setError('Die Lobby wurde geschlossen.')
    }

    const handleDisconnect = () => {
      setScreen('menu')
      setLobbyData(null)
      setGameData(null)
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

  const handleCreate = (name: string) => {
    if (!socket) return
    setMyName(name)
    setError('')
    socket.emit('lobby:create', name, (response?: WerBinIchAck) => {
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
      if (response?.error) {
        setError(response.error)
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
    setError('')
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
            onCreateLobby={handleCreate}
            onJoinLobby={handleJoin}
            error={error}
            clearError={() => setError('')}
          />
        )}

        {screen === 'lobby' && socket && lobbyData && (
          <Lobby
            socket={socket}
            lobby={lobbyData}
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
