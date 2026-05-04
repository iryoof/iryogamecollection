import { useState, useEffect } from 'react'
import { Socket } from 'socket.io-client'
import { PageType } from '../App'
import type { GameSocketApi } from '../hooks/useGameSocket'

const SPLASH_MESSAGES = [
  'Ey Nico kennst du jemanden der Tin heißt?',
  'Bdonis',
  'Warum liegt auf Antons Kopf Stroh?',
  'Noah hat KEINE kroatischen Wurzeln'
]

const getLocalDateKey = () => {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const hashString = (input: string) => {
  let hash = 0
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash)
}

const seededRandom = (seed: number) => {
  let value = seed
  return () => {
    value = (value * 1664525 + 1013904223) % 4294967296
    return value / 4294967296
  }
}

const getDailySplashMessages = (count: number) => {
  const seed = hashString(getLocalDateKey())
  const rng = seededRandom(seed)
  const shuffled = [...SPLASH_MESSAGES]
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1))
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  return shuffled.slice(0, Math.min(count, shuffled.length))
}

interface LobbyScreenProps {
  socket: Socket | null
  onNavigate: (page: PageType) => void
  game: GameSocketApi
  inviteCode?: string
  onInviteCodeConsumed?: () => void
}

export default function LobbyScreen({ socket, onNavigate, game, inviteCode, onInviteCodeConsumed }: LobbyScreenProps) {
  const { gameState, error, loading, joinLobby, createLobby } = game
  const [nickname, setNickname] = useState(() => {
    if (typeof window === 'undefined') return ''
    return localStorage.getItem('cypher-nickname') || ''
  })
  const [joinCode, setJoinCode] = useState('')
  const [step, setStep] = useState<'menu' | 'join' | 'create'>('menu')
  const [localError, setLocalError] = useState('')
  const [pendingNavigation, setPendingNavigation] = useState(false)
  const splashMessage = getDailySplashMessages(1)[0]

  // If the user arrived via an invite link (`?code=ABC123`), drop them
  // directly onto the join form with the code prefilled.
  useEffect(() => {
    if (!inviteCode) return
    setJoinCode(inviteCode)
    setStep('join')
    setLocalError('')
    onInviteCodeConsumed?.()
  }, [inviteCode, onInviteCodeConsumed])

  useEffect(() => {
    if (gameState && pendingNavigation) {
      setStep('menu')
      setPendingNavigation(false)
      onNavigate('setup')
    }
  }, [gameState, pendingNavigation, onNavigate])

  const handleCreateLobby = () => {
    if (!nickname.trim()) {
      setLocalError('Nickname erforderlich!')
      return
    }
    if (!socket?.connected) {
      setLocalError('Keine Verbindung zum Server!')
      return
    }
    setLocalError('')
    setPendingNavigation(true)
    createLobby(nickname, 3, false, 60)
  }

  const handleJoinLobby = () => {
    if (!nickname.trim()) {
      setLocalError('Nickname erforderlich!')
      return
    }
    if (!joinCode.trim()) {
      setLocalError('Lobby-Code erforderlich!')
      return
    }
    if (!socket?.connected) {
      setLocalError('Keine Verbindung zum Server!')
      return
    }
    setLocalError('')
    setPendingNavigation(true)
    joinLobby(joinCode.toUpperCase(), nickname)
  }

  const displayError = localError || error

  return (
    <div className="flex flex-col items-center justify-center min-h-screen px-4 py-8">
      <div className="w-full max-w-xl space-y-8">
        <div className="text-center space-y-5">
          <p className="section-kicker">Underground Word Relay</p>
          <div className="space-y-3">
            <h1 className="hero-title text-[clamp(3.4rem,12vw,6.8rem)] leading-none">Cypher</h1>
            {splashMessage && (
              <div className="flex justify-center">
                <span className="splash-tag">{splashMessage}</span>
              </div>
            )}
          </div>
          <div className="max-w-lg mx-auto space-y-2">
            <p className="text-lg text-zinc-200">Minimal. Roh. Direkt aus dem Untergrund.</p>
            <p className="text-sm text-zinc-500 font-mono-ui uppercase tracking-[0.24em]">
              Schreibe. Gib weiter. Zerlege die Stille.
            </p>
          </div>
          {!socket?.connected && (
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-mono-ui uppercase tracking-[0.18em] text-zinc-400">
              <span className="h-2 w-2 rounded-full bg-white/40 animate-pulse-line" />
              Server-Verbindung wird hergestellt
            </div>
          )}
        </div>

        <div className="screen-shell rounded-[2rem] p-6 md:p-8">
          {step === 'menu' && (
            <div className="space-y-4 animate-fade-in">
              <button
                onClick={() => {
                  setStep('create')
                  setLocalError('')
                }}
                disabled={!socket?.connected || loading}
                className="action-primary w-full px-6 py-4 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Neues Spiel erstellen
              </button>
              <button
                onClick={() => {
                  setStep('join')
                  setLocalError('')
                }}
                disabled={!socket?.connected || loading}
                className="action-secondary w-full px-6 py-4 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Spiel beitreten
              </button>
              <button
                onClick={() => onNavigate('archive')}
                className="action-ghost w-full px-6 py-4 text-sm"
              >
                Archiv ansehen
              </button>
            </div>
          )}

          {step === 'create' && (
            <div className="space-y-5 animate-fade-in">
              <div className="space-y-2 text-center">
                <p className="section-kicker">Create Lobby</p>
                <h3 className="text-3xl font-semibold text-white">Neue Session</h3>
              </div>

              <div className="space-y-2">
                <label className="section-kicker">Dein Nickname</label>
                <input
                  type="text"
                  value={nickname}
                  onChange={event => setNickname(event.target.value.slice(0, 20))}
                  maxLength={20}
                  placeholder="z.B. Bob123"
                  autoFocus
                  className="w-full rounded-2xl px-4 py-4 text-base placeholder:text-zinc-600"
                />
                <p className="text-right text-xs text-zinc-600 font-mono-ui">{nickname.length}/20</p>
              </div>

              {displayError && (
                <div className="alert-danger rounded-2xl px-4 py-3 text-sm">
                  {displayError}
                </div>
              )}

              <div className="space-y-3">
                <button
                  onClick={handleCreateLobby}
                  disabled={loading || !socket?.connected}
                  className="action-primary w-full px-6 py-4 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? 'Erstelle...' : 'Spiel erstellen'}
                </button>

                <button
                  onClick={() => {
                    setStep('menu')
                    setNickname('')
                    setLocalError('')
                  }}
                  className="action-secondary w-full px-6 py-4 text-sm"
                >
                  Zurueck
                </button>
              </div>
            </div>
          )}

          {step === 'join' && (
            <div className="space-y-5 animate-fade-in">
              <div className="space-y-2 text-center">
                <p className="section-kicker">Join Lobby</p>
                <h3 className="text-3xl font-semibold text-white">In die Session rein</h3>
              </div>

              <div className="space-y-2">
                <label className="section-kicker">Dein Nickname</label>
                <input
                  type="text"
                  value={nickname}
                  onChange={event => setNickname(event.target.value.slice(0, 20))}
                  maxLength={20}
                  placeholder="z.B. Bob123"
                  autoFocus
                  className="w-full rounded-2xl px-4 py-4 text-base placeholder:text-zinc-600"
                />
                <p className="text-right text-xs text-zinc-600 font-mono-ui">{nickname.length}/20</p>
              </div>

              <div className="space-y-2">
                <label className="section-kicker">Lobby-Code</label>
                <input
                  type="text"
                  value={joinCode}
                  onChange={event => setJoinCode(event.target.value.toUpperCase())}
                  maxLength={6}
                  placeholder="z.B. ABC123"
                  className="display-code w-full rounded-2xl px-4 py-4 text-base placeholder:text-zinc-600"
                />
              </div>

              {displayError && (
                <div className="alert-danger rounded-2xl px-4 py-3 text-sm">
                  {displayError}
                </div>
              )}

              <div className="space-y-3">
                <button
                  onClick={handleJoinLobby}
                  disabled={loading || !socket?.connected}
                  className="action-primary w-full px-6 py-4 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? 'Trete bei...' : 'Beitreten'}
                </button>

                <button
                  onClick={() => {
                    setStep('menu')
                    setNickname('')
                    setJoinCode('')
                    setLocalError('')
                  }}
                  className="action-secondary w-full px-6 py-4 text-sm"
                >
                  Zurueck
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="text-center text-xs text-zinc-600 font-mono-ui uppercase tracking-[0.22em]">
          Built for cramped rooms and loud ideas
        </div>
      </div>
    </div>
  )
}
