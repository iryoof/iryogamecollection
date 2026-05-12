import { useState, useEffect } from 'react'
import { Socket } from 'socket.io-client'
import { PageType } from '../App'
import type { GameSocketApi } from '../hooks/useGameSocket'
import { useTranslation } from 'react-i18next'

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

interface LobbyScreenProps {
  socket: Socket | null
  onNavigate: (page: PageType) => void
  game: GameSocketApi
  inviteCode?: string
  onInviteCodeConsumed?: () => void
}

export default function LobbyScreen({ socket, onNavigate, game, inviteCode, onInviteCodeConsumed }: LobbyScreenProps) {
  const { t, i18n } = useTranslation()
  const { gameState, error, loading, joinLobby, createLobby } = game
  const [nickname, setNickname] = useState(() => {
    if (typeof window === 'undefined') return ''
    return localStorage.getItem('cypher-nickname') || ''
  })
  const [joinCode, setJoinCode] = useState('')
  const [step, setStep] = useState<'menu' | 'join' | 'create'>('menu')
  const [localError, setLocalError] = useState('')
  const [pendingNavigation, setPendingNavigation] = useState(false)
  const [createPlaceholder, setCreatePlaceholder] = useState('')
  const [joinPlaceholder, setJoinPlaceholder] = useState('')
  const [showLanguageDropdown, setShowLanguageDropdown] = useState(false)

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

  useEffect(() => {
    setCreatePlaceholder(`${t('example')} ${RAPPER_NAMES[Math.floor(Math.random() * RAPPER_NAMES.length)]}`)
    setJoinPlaceholder(`${t('example')} ${RAPPER_NAMES[Math.floor(Math.random() * RAPPER_NAMES.length)]}`)
  }, [t])

  const handleCreateLobby = () => {
    if (!nickname.trim()) {
      setLocalError(t('nicknameRequired'))
      return
    }
    if (!socket?.connected) {
      setLocalError(t('noConnection'))
      return
    }
    setLocalError('')
    setPendingNavigation(true)
    createLobby(nickname, 3, false, 60)
  }

  const handleJoinLobby = () => {
    if (!nickname.trim()) {
      setLocalError(t('nicknameRequired'))
      return
    }
    if (!joinCode.trim()) {
      setLocalError(t('codeRequired'))
      return
    }
    if (!socket?.connected) {
      setLocalError(t('noConnection'))
      return
    }
    setLocalError('')
    setPendingNavigation(true)
    joinLobby(joinCode.toUpperCase(), nickname)
  }

  const displayError = localError || error

  const changeLanguage = (lng: string) => {
    i18n.changeLanguage(lng)
    setShowLanguageDropdown(false)
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen px-4 py-8">
      <div className="w-full max-w-xl space-y-8">
        <div className="text-center space-y-5">
          <p className="section-kicker">{t('undergroundWordRelay')}</p>
          <div className="space-y-3">
            <h1 className="hero-title text-[clamp(3.4rem,12vw,6.8rem)] leading-none">{t('cypher')}</h1>
          </div>
          {!socket?.connected && (
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-mono-ui uppercase tracking-[0.18em] text-zinc-400">
              <span className="h-2 w-2 rounded-full bg-white/40 animate-pulse-line" />
              {t('connecting')}
            </div>
          )}
        </div>

        <div className="screen-shell rounded-[2rem] p-6 md:p-8">
          {step === 'menu' && (
            <div className="space-y-4 animate-fade-in">
              <button
                onClick={() => {
                  setCreatePlaceholder(`${t('example')} ${RAPPER_NAMES[Math.floor(Math.random() * RAPPER_NAMES.length)]}`)
                  setStep('create')
                  setLocalError('')
                }}
                disabled={!socket?.connected || loading}
                className="action-primary w-full px-6 py-4 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {t('createNewGame')}
              </button>
              <button
                onClick={() => {
                  setJoinPlaceholder(`${t('example')} ${RAPPER_NAMES[Math.floor(Math.random() * RAPPER_NAMES.length)]}`)
                  setStep('join')
                  setLocalError('')
                }}
                disabled={!socket?.connected || loading}
                className="action-secondary w-full px-6 py-4 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {t('joinGame')}
              </button>
              <button
                onClick={() => onNavigate('archive')}
                className="action-ghost w-full px-6 py-4 text-sm"
              >
                {t('viewArchive')}
              </button>
            </div>
          )}

          {step === 'create' && (
            <div className="space-y-5 animate-fade-in">
              <div className="space-y-2 text-center">
                <p className="section-kicker">{t('createLobby')}</p>
                <h3 className="text-3xl font-semibold text-white">{t('newSession')}</h3>
              </div>

              <div className="space-y-2">
                <label className="section-kicker">{t('yourNickname')}</label>
                <input
                  type="text"
                  value={nickname}
                  onChange={event => setNickname(event.target.value.slice(0, 20))}
                  maxLength={20}
                  placeholder={createPlaceholder}
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
                  {loading ? t('creating') : t('createGame')}
                </button>

                <button
                  onClick={() => {
                    setStep('menu')
                    setNickname('')
                    setLocalError('')
                  }}
                  className="action-secondary w-full px-6 py-4 text-sm"
                >
                  {t('back')}
                </button>
              </div>
            </div>
          )}

          {step === 'join' && (
            <div className="space-y-5 animate-fade-in">
              <div className="space-y-2 text-center">
                <p className="section-kicker">{t('joinLobby')}</p>
                <h3 className="text-3xl font-semibold text-white">{t('joinSession')}</h3>
              </div>

              <div className="space-y-2">
                <label className="section-kicker">{t('yourNickname')}</label>
                <input
                  type="text"
                  value={nickname}
                  onChange={event => setNickname(event.target.value.slice(0, 20))}
                  maxLength={20}
                  placeholder={joinPlaceholder}
                  autoFocus
                  className="w-full rounded-2xl px-4 py-4 text-base placeholder:text-zinc-600"
                />
                <p className="text-right text-xs text-zinc-600 font-mono-ui">{nickname.length}/20</p>
              </div>

              <div className="space-y-2">
                <label className="section-kicker">{t('lobbyCode')}</label>
                <input
                  type="text"
                  value={joinCode}
                  onChange={event => setJoinCode(event.target.value.toUpperCase())}
                  maxLength={6}
                  placeholder={t('exampleCode')}
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
                  {loading ? t('joining') : t('join')}
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
                  {t('back')}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Language Selector Button */}
        <div className="fixed bottom-6 right-6 z-50">
          <div className="relative">
            <button
              onClick={() => setShowLanguageDropdown(!showLanguageDropdown)}
              className="bg-black/80 hover:bg-black/90 text-white px-4 py-2 rounded-lg border border-white/10 backdrop-blur-sm transition-colors"
            >
              {t('language')}
            </button>
            {showLanguageDropdown && (
              <div className="absolute bottom-full right-0 mb-2 bg-black/90 border border-white/10 rounded-lg backdrop-blur-sm min-w-[120px]">
                <button
                  onClick={() => changeLanguage('de')}
                  className="block w-full text-left px-4 py-2 text-white hover:bg-white/10 first:rounded-t-lg"
                >
                  Deutsch
                </button>
                <button
                  onClick={() => changeLanguage('en')}
                  className="block w-full text-left px-4 py-2 text-white hover:bg-white/10"
                >
                  English
                </button>
                <button
                  onClick={() => changeLanguage('fr')}
                  className="block w-full text-left px-4 py-2 text-white hover:bg-white/10 last:rounded-b-lg"
                >
                  Français
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
