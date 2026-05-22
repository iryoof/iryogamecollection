import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import type { Socket } from 'socket.io-client'
import LanguageSelector from '../../components/LanguageSelector'
import type { WavvelengthAck, WavvelengthSession } from './types'

interface MainMenuProps {
  socket: Socket
  onSession: (session: WavvelengthSession) => void
  error: string
  onError: (message: string) => void
  clearError: () => void
}

export default function MainMenu({ socket, onSession, error, onError, clearError }: MainMenuProps) {
  const { t } = useTranslation()
  const [mode, setMode] = useState<'home' | 'join' | 'create'>('home')
  const [nickname, setNickname] = useState('')
  const [lobbyCode, setLobbyCode] = useState('')
  const [loading, setLoading] = useState(false)

  const handleCreate = () => {
    if (!nickname.trim()) {
      onError(t('pleaseEnterNickname'))
      return
    }

    setLoading(true)
    socket.emit('wvl:lobby:create', nickname.trim(), (response?: WavvelengthAck) => {
      setLoading(false)
      if (response?.error) {
        onError(response.error)
        return
      }
      if (response?.session) {
        clearError()
        onSession({ ...response.session, reconnectDeadline: null })
      }
    })
  }

  const handleJoin = () => {
    if (!nickname.trim()) {
      onError(t('pleaseEnterNickname'))
      return
    }
    if (!lobbyCode.trim()) {
      onError(t('pleaseEnterCode'))
      return
    }

    setLoading(true)
    socket.emit('wvl:lobby:join', lobbyCode.trim().toUpperCase(), nickname.trim(), (response?: WavvelengthAck) => {
      setLoading(false)
      if (response?.error) {
        onError(response.error)
        return
      }
      if (response?.session) {
        clearError()
        onSession({ ...response.session, reconnectDeadline: null })
      }
    })
  }

  const goHome = () => {
    setMode('home')
    setLobbyCode('')
    clearError()
  }

  if (mode === 'create' || mode === 'join') {
    const isJoin = mode === 'join'

    return (
      <div className="flex flex-col items-center justify-center min-h-screen px-4 py-8 relative">
        <div className="w-full max-w-md space-y-8">
          <div className="text-center space-y-3">
            <p className="section-kicker">{t('numberGuessingGame')}</p>
            <h1 className="hero-title text-[clamp(2.8rem,10vw,4.8rem)] leading-none">{t('wavvelength')}</h1>
            <p className="text-sm text-zinc-400">{isJoin ? t('joinLobby') : t('createLobby')}</p>
          </div>

          <div className="screen-shell rounded-[2rem] p-6 md:p-8 space-y-5 animate-fade-in">
            <div className="space-y-2">
              <label className="section-kicker">{t('yourNickname')}</label>
              <input
                type="text"
                value={nickname}
                onChange={event => setNickname(event.target.value.slice(0, 20))}
                maxLength={20}
                placeholder={t('example') + ' Kollegah'}
                className="w-full rounded-2xl px-4 py-4 text-base placeholder:text-zinc-600"
              />
              <p className="text-right text-xs text-zinc-600 font-mono-ui">{nickname.length}/20</p>
            </div>

            {isJoin && (
              <div className="space-y-2">
                <label className="section-kicker">{t('lobbyCode')}</label>
                <input
                  type="text"
                  value={lobbyCode}
                  onChange={event => setLobbyCode(event.target.value.toUpperCase())}
                  maxLength={6}
                  placeholder={t('exampleCode')}
                  className="display-code w-full rounded-2xl px-4 py-4 text-base placeholder:text-zinc-600"
                />
              </div>
            )}

            {error && <div className="alert-danger rounded-2xl px-4 py-3 text-sm">{error}</div>}

            <div className="space-y-3">
              <button
                onClick={isJoin ? handleJoin : handleCreate}
                disabled={loading}
                className="action-primary w-full px-6 py-4 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? (isJoin ? t('joining') : t('creating')) : (isJoin ? t('join') : t('createGame'))}
              </button>
              <button
                onClick={goHome}
                className="action-secondary w-full px-6 py-4 text-sm"
              >
                {t('back')}
              </button>
            </div>
          </div>

          <LanguageSelector />
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen px-4 py-8 relative">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center space-y-4">
          <p className="section-kicker">{t('numberGuessingGame')}</p>
          <h1 className="hero-title text-[clamp(3.1rem,12vw,5.2rem)] leading-none">{t('wavvelength')}</h1>
          <p className="text-white/70">{t('wavvelengthDescription')}</p>
        </div>

        <div className="screen-shell rounded-[2rem] p-6 md:p-8 space-y-4 animate-fade-in">
          <button
            onClick={() => {
              setMode('create')
              clearError()
            }}
            className="action-primary w-full px-6 py-4 text-sm"
          >
            {t('createLobby')}
          </button>
          <button
            onClick={() => {
              setMode('join')
              clearError()
            }}
            className="action-secondary w-full px-6 py-4 text-sm"
          >
            {t('joinLobby')}
          </button>
          <Link
            to="/"
            className="action-ghost flex w-full items-center justify-center px-6 py-4 text-sm no-underline"
          >
            {t('backToPortal')}
          </Link>
        </div>

        <div className="surface-panel rounded-[1.5rem] p-5 text-sm text-zinc-300 space-y-2">
          <p className="section-kicker">So läuft's</p>
          <ul className="space-y-2 list-disc list-inside text-zinc-400">
            <li>Alle stimmen für eine Zahl von 1 bis 10.</li>
            <li>Eine Person kennt die Zahl nicht und muss sie herausfinden.</li>
            <li>Mit einer Frage pro Mitspieler tastet sich der Seeker an die Antwort heran.</li>
          </ul>
        </div>

        {error && <div className="alert-danger rounded-2xl px-4 py-3 text-sm">{error}</div>}

        <LanguageSelector />
      </div>
    </div>
  )
}
