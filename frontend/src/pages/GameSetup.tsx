import { useEffect, useRef, useState } from 'react'
import { Socket } from 'socket.io-client'
import { PageType } from '../App'
import type { GameSocketApi } from '../hooks/useGameSocket'

interface GameSetupProps {
  socket: Socket | null
  onNavigate: (page: PageType) => void
  game: GameSocketApi
}

export default function GameSetup({ socket, onNavigate, game }: GameSetupProps) {
  const {
    gameState, error, loading,
    leaveLobby, closeLobby, clearSession, startGame,
    kickPlayer, transferHost
  } = game
  const [timerEnabled, setTimerEnabled] = useState(false)
  const [timerSeconds, setTimerSeconds] = useState(60)
  const [lobbyCode, setLobbyCode] = useState('')
  const [copyFeedback, setCopyFeedback] = useState<'code' | 'link' | null>(null)
  const storedPlayerId = typeof window !== 'undefined' ? sessionStorage.getItem('cypher-player-id') : null
  const selfId = storedPlayerId || socket?.id || ''
  const isHost = !!gameState && gameState.hostId === selfId
  const hasRequestedState = useRef(false)

  useEffect(() => {
    const storedCode = sessionStorage.getItem('cypher-lobby-code') || ''
    setLobbyCode(gameState?.lobbyCode || storedCode)
  }, [gameState?.lobbyCode])

  useEffect(() => {
    if (!socket?.connected) return
    if (gameState) return
    if (hasRequestedState.current) return
    hasRequestedState.current = true
    socket.emit('request-state')
  }, [socket, gameState])

  useEffect(() => {
    if (!socket) return

    const handleRoundStarted = (roundNumber: number, prompt: string) => {
      sessionStorage.setItem('cypher-round-prompt', JSON.stringify({ roundNumber, prompt }))
      onNavigate('game')
    }

    socket.on('round-started', handleRoundStarted)

    return () => {
      socket.off('round-started', handleRoundStarted)
    }
  }, [socket, onNavigate])

  useEffect(() => {
    if (!copyFeedback) return
    const handle = setTimeout(() => setCopyFeedback(null), 1500)
    return () => clearTimeout(handle)
  }, [copyFeedback])

  const handleStartGame = () => {
    startGame()
  }

  const handleCopyCode = async () => {
    if (!lobbyCode) return
    try {
      await navigator.clipboard.writeText(lobbyCode)
      setCopyFeedback('code')
    } catch {
      setCopyFeedback(null)
    }
  }

  const handleCopyInviteLink = async () => {
    if (!lobbyCode || typeof window === 'undefined') return
    const link = `${window.location.origin}/?code=${encodeURIComponent(lobbyCode)}`
    try {
      await navigator.clipboard.writeText(link)
      setCopyFeedback('link')
    } catch {
      setCopyFeedback(null)
    }
  }

  const handleKickPlayer = (playerId: string, nickname: string) => {
    if (!window.confirm(`Moechtest du ${nickname} wirklich aus der Lobby entfernen?`)) return
    kickPlayer(playerId)
  }

  const handleTransferHost = (playerId: string, nickname: string) => {
    if (!window.confirm(`Host-Rolle an ${nickname} uebertragen?`)) return
    transferHost(playerId)
  }

  if (!gameState) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen px-4 py-8">
        <div className="screen-shell w-full max-w-lg rounded-[2rem] p-8 text-center space-y-4">
          <p className="section-kicker">Lobby State</p>
          <h1 className="text-3xl font-semibold text-white">
            {loading ? 'Lobby wird geladen...' : 'Keine aktive Lobby'}
          </h1>
          <p className="text-sm text-zinc-500">
            {loading
              ? 'Einen Moment bitte - wir holen den Status vom Server.'
              : 'Bitte trete einer Lobby bei oder erstelle eine neue.'}
          </p>
          {error && (
            <div className="alert-danger rounded-2xl px-4 py-3 text-sm">
              {error}
            </div>
          )}
          <button
            onClick={() => {
              clearSession()
              onNavigate('menu')
            }}
            className="action-secondary w-full px-6 py-4 text-sm"
          >
            Zurueck zum Menue
          </button>
        </div>
      </div>
    )
  }

  const disconnectedIds = new Set(gameState.disconnectedPlayerIds || [])

  return (
    <div className="flex flex-col items-center justify-center min-h-screen px-4 py-8">
      <div className="w-full max-w-3xl space-y-6">
        <div className="text-center space-y-3">
          <p className="section-kicker">Lobby Control</p>
          <h1 className="hero-title text-[clamp(2.5rem,8vw,4.8rem)] leading-none">Session</h1>
          <p className="text-sm text-zinc-500 font-mono-ui uppercase tracking-[0.2em]">
            Leute sammeln. Ton setzen. Startschuss geben.
          </p>
        </div>

        <div className="screen-shell rounded-[2rem] p-6 md:p-8 space-y-6">
          <div className="surface-panel rounded-[1.5rem] p-5 text-center space-y-3">
            <p className="section-kicker">Lobby-Code</p>
            <div className="flex items-center justify-center gap-3 flex-wrap">
              <span className="display-code text-3xl text-white">
                {lobbyCode || '-'}
              </span>
              {lobbyCode && (
                <>
                  <button
                    onClick={handleCopyCode}
                    className="action-secondary px-4 py-3 text-[11px]"
                  >
                    {copyFeedback === 'code' ? 'Kopiert' : 'Code kopieren'}
                  </button>
                  <button
                    onClick={handleCopyInviteLink}
                    className="action-secondary px-4 py-3 text-[11px]"
                  >
                    {copyFeedback === 'link' ? 'Kopiert' : 'Link kopieren'}
                  </button>
                </>
              )}
            </div>
            <p className="text-xs text-zinc-600 font-mono-ui uppercase tracking-[0.14em]">
              Teile den Code oder den Direktlink mit deinen Freunden
            </p>
          </div>

          <div className="surface-panel rounded-[1.5rem] p-5 space-y-4">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <p className="section-kicker">Roster</p>
                <h3 className="text-2xl font-semibold text-white">Spielerliste</h3>
              </div>
              <span className="status-chip status-chip-muted">
                {gameState.players.length} Spieler
              </span>
            </div>
            {gameState.players.length ? (
              <div className="grid grid-cols-1 gap-3">
                {gameState.players.map(player => {
                  const isSelf = player.id === selfId
                  const isPlayerHost = player.id === gameState.hostId
                  const isDisconnected = disconnectedIds.has(player.id)
                  const deadline = gameState.disconnectDeadlines?.[player.id]

                  return (
                    <div
                      key={player.id}
                      className={`surface-panel-strong rounded-[1.25rem] px-4 py-4 text-sm ${
                        isDisconnected ? 'opacity-70' : ''
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            {isPlayerHost && (
                              <span className="status-chip bg-white text-black border-white">Host</span>
                            )}
                            {isSelf && (
                              <span className="status-chip status-chip-muted">Du</span>
                            )}
                            {isDisconnected && (
                              <DisconnectBadge deadline={deadline} />
                            )}
                          </div>
                          <div className="truncate text-base font-semibold text-zinc-100">
                            {player.nickname}
                          </div>
                        </div>

                        {isHost && !isSelf && !isDisconnected && (
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleTransferHost(player.id, player.nickname)}
                              title="Host-Rolle uebertragen"
                              className="action-secondary px-3 py-2 text-[11px]"
                            >
                              Host geben
                            </button>
                            <button
                              onClick={() => handleKickPlayer(player.id, player.nickname)}
                              title="Spieler entfernen"
                              className="action-danger px-3 py-2 text-[11px]"
                            >
                              Entfernen
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="text-xs text-zinc-600 font-mono-ui uppercase tracking-[0.14em]">
                Noch keine Spieler beigetreten.
              </div>
            )}
          </div>

          <div className="surface-panel rounded-[1.5rem] p-5 space-y-4">
            <p className="section-kicker">Timer</p>
            <label className="flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-white/[0.02] px-4 py-4 cursor-pointer">
              <span className="text-sm text-zinc-200">Timer aktivieren</span>
              <input
                type="checkbox"
                checked={timerEnabled}
                onChange={(e) => setTimerEnabled(e.target.checked)}
                className="h-5 w-5 rounded bg-black/40 border-white/20"
              />
            </label>
          </div>

          {timerEnabled && (
            <div className="surface-panel rounded-[1.5rem] p-5 space-y-4">
              <label className="section-kicker">
                Zeit pro Runde {timerSeconds}s
              </label>
              <div className="grid grid-cols-3 gap-2">
                {[60, 120, 180, 240, 300].map(seconds => (
                  <button
                    key={seconds}
                    onClick={() => setTimerSeconds(seconds)}
                    className={`rounded-2xl px-4 py-3 text-xs font-mono-ui uppercase tracking-[0.12em] transition ${
                      timerSeconds === seconds
                        ? 'bg-white text-black border border-white'
                        : 'bg-white/5 text-zinc-300 border border-white/10 hover:bg-white/10'
                    }`}
                  >
                    {seconds}s
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="metric-strip rounded-[1.5rem] p-5 text-sm text-zinc-400 space-y-1">
            <p>Mindestens 3 Spieler</p>
            <p>{timerEnabled ? `Timer: ${timerSeconds}s` : 'Ohne Timer'}</p>
          </div>

          <div className="space-y-3 pt-2">
            {error && (
              <div className="alert-danger rounded-2xl px-4 py-3 text-sm">
                {error}
              </div>
            )}
            <button
              onClick={handleStartGame}
              disabled={!isHost || gameState.players.length < 3}
              className="action-primary w-full px-6 py-4 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Spiel starten
            </button>
            {!isHost && (
              <div className="text-xs text-zinc-600 text-center font-mono-ui uppercase tracking-[0.14em]">
                Nur der Host kann das Spiel starten.
              </div>
            )}

            {isHost ? (
              <>
                <button
                  onClick={() => {
                    leaveLobby()
                    clearSession()
                    onNavigate('menu')
                  }}
                  className="action-secondary w-full px-6 py-4 text-sm"
                >
                  Lobby verlassen (Host wird uebertragen)
                </button>
                <button
                  onClick={() => {
                    if (!window.confirm('Lobby wirklich fuer alle schliessen?')) return
                    closeLobby()
                    clearSession()
                    onNavigate('menu')
                  }}
                  className="action-danger w-full px-6 py-4 text-sm"
                >
                  Lobby schliessen
                </button>
              </>
            ) : (
              <button
                onClick={() => {
                  leaveLobby()
                  clearSession()
                  onNavigate('menu')
                }}
                className="action-secondary w-full px-6 py-4 text-sm"
              >
                Lobby verlassen
              </button>
            )}

            <button
              onClick={() => onNavigate('menu')}
              className="action-ghost w-full px-6 py-4 text-sm"
            >
              Zurueck
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * Small helper that ticks down the remaining reconnect grace time in the UI
 * without re-rendering the whole GameSetup every second.
 */
function DisconnectBadge({ deadline }: { deadline: number | undefined }) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!deadline) return
    const handle = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(handle)
  }, [deadline])

  if (!deadline) {
    return <span className="status-chip border-yellow-400/30 bg-yellow-400/10 text-yellow-300">Getrennt</span>
  }

  const secs = Math.max(0, Math.ceil((deadline - now) / 1000))
  return (
    <span className="status-chip border-yellow-400/30 bg-yellow-400/10 text-yellow-300">
      Getrennt ({secs}s)
    </span>
  )
}
