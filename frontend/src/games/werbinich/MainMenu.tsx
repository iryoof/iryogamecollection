import { FormEvent, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

interface MainMenuProps {
  socketConnected: boolean
  onCreateLobby: (name: string) => void
  onJoinLobby: (name: string, code: string) => void
  onReconnect: () => void
  error: string
  clearError: () => void
  reconnectAvailable: boolean
  reconnectSecondsLeft: number
  reconnecting: boolean
  reconnectPlayerName?: string
  reconnectLobbyCode?: string
}

const RAPPER_NAMES = [
  'Kollegah',
  'Farid Bang',
  'Asche',
  'Sun Diego',
  'Spongebozz',
  'Perplexx',
  'Fortis',
  'Taube',
  'Zodiac',
  '4Tune',
  'Gio',
  'Grinch Hill',
  'Majoe',
  'SSIO',
  'Daemon',
  'Hank',
  'Bushido',
  'Shindy',
  'Laas',
  'OG Keemo',
  'John Webber',
  'Rapido'
]

const getRandomExampleName = () =>
  `z. B. ${RAPPER_NAMES[Math.floor(Math.random() * RAPPER_NAMES.length)]}`

export default function MainMenu({
  socketConnected,
  onCreateLobby,
  onJoinLobby,
  onReconnect,
  error,
  clearError,
  reconnectAvailable,
  reconnectSecondsLeft,
  reconnecting,
  reconnectPlayerName,
  reconnectLobbyCode
}: MainMenuProps) {
  const [mode, setMode] = useState<null | 'create' | 'join'>(null)
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [placeholder, setPlaceholder] = useState(getRandomExampleName())

  useEffect(() => {
    setPlaceholder(getRandomExampleName())
  }, [mode])

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (mode === 'create') {
      onCreateLobby(name.trim())
      return
    }

    if (mode === 'join') {
      onJoinLobby(name.trim(), code.trim().toUpperCase())
    }
  }

  const handleBack = () => {
    setMode(null)
    setName('')
    setCode('')
    clearError()
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen px-4 py-8">
      <div className="w-full max-w-xl space-y-8">
        <div className="text-center space-y-5">
          <p className="section-kicker">Party Game</p>
          <div className="space-y-3">
            <h1 className="hero-title text-[clamp(2.9rem,11vw,6.2rem)] leading-none">
              Wer bin ich?
            </h1>
            <div className="flex justify-center">
              <span className="splash-tag">Heimlich schreiben. Laut rätseln.</span>
            </div>
          </div>
          {!socketConnected && (
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-mono-ui uppercase tracking-[0.18em] text-zinc-400">
              <span className="h-2 w-2 rounded-full bg-white/40 animate-pulse-line" />
              Server-Verbindung wird hergestellt
            </div>
          )}
        </div>

        <div className="screen-shell rounded-[2rem] p-6 md:p-8">
          {!mode ? (
            <div className="space-y-4 animate-fade-in">
              {reconnectAvailable && (
                <div className="surface-panel rounded-[1.5rem] p-4 space-y-3">
                  <div className="text-center space-y-1">
                    <p className="section-kicker">Reconnect</p>
                    <p className="text-sm text-zinc-300">
                      {reconnectPlayerName || 'Letzte Session'} in Lobby{' '}
                      <span className="text-zinc-100">{reconnectLobbyCode || '-----'}</span>
                    </p>
                    <p className="text-xs text-zinc-500 font-mono-ui uppercase tracking-[0.14em]">
                      Verfügbar für {reconnectSecondsLeft}s
                    </p>
                  </div>
                  <button
                    onClick={onReconnect}
                    disabled={!socketConnected || reconnecting}
                    className="action-primary w-full px-6 py-4 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {reconnecting ? 'Verbinde...' : 'Wiederverbinden'}
                  </button>
                </div>
              )}
              <button
                onClick={() => {
                  setMode('create')
                  clearError()
                }}
                disabled={!socketConnected}
                className="action-primary w-full px-6 py-4 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Lobby erstellen
              </button>
              <button
                onClick={() => {
                  setMode('join')
                  clearError()
                }}
                disabled={!socketConnected}
                className="action-secondary w-full px-6 py-4 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Lobby beitreten
              </button>
              <Link
                to="/"
                className="action-ghost flex w-full items-center justify-center px-6 py-4 text-sm no-underline"
              >
                Zurück zum Portal
              </Link>
            </div>
          ) : (
            <form className="space-y-5 animate-fade-in" onSubmit={handleSubmit}>
              <div className="space-y-2 text-center">
                <p className="section-kicker">
                  {mode === 'create' ? 'Create Lobby' : 'Join Lobby'}
                </p>
                <h3 className="text-3xl font-semibold text-white">
                  {mode === 'create' ? 'Neue Runde' : 'In die Runde rein'}
                </h3>
              </div>

              <div className="space-y-2">
                <label className="section-kicker">Dein Name</label>
                <input
                  type="text"
                  placeholder={placeholder}
                  value={name}
                  onChange={event => setName(event.target.value.slice(0, 20))}
                  maxLength={20}
                  autoFocus
                  required
                  className="w-full rounded-2xl px-4 py-4 text-base placeholder:text-zinc-600"
                />
                <p className="text-right text-xs text-zinc-600 font-mono-ui">{name.length}/20</p>
              </div>

              {mode === 'join' && (
                <div className="space-y-2">
                  <label className="section-kicker">Lobby-Code</label>
                  <input
                    type="text"
                    placeholder="z. B. A1B2C"
                    value={code}
                    onChange={event => setCode(event.target.value.toUpperCase())}
                    maxLength={5}
                    required
                    className="display-code w-full rounded-2xl px-4 py-4 text-base placeholder:text-zinc-600"
                  />
                </div>
              )}

              {error && (
                <div className="alert-danger rounded-2xl px-4 py-3 text-sm">
                  {error}
                </div>
              )}

              <div className="space-y-3">
                <button
                  type="submit"
                  disabled={!socketConnected}
                  className="action-primary w-full px-6 py-4 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {mode === 'create' ? 'Erstellen' : 'Beitreten'}
                </button>
                <button
                  type="button"
                  onClick={handleBack}
                  className="action-secondary w-full px-6 py-4 text-sm"
                >
                  Zurück
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}

