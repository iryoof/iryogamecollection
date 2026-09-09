import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { useEffect } from 'react'
import LanguageSelector from '../components/LanguageSelector'

export default function GamePortal() {
  const { t } = useTranslation()

  useEffect(() => {
    document.title = 'Iryo Game Collection'
  }, [])

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-8 relative">
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.09),transparent_30%),radial-gradient(circle_at_bottom_right,rgba(255,255,255,0.05),transparent_28%)]" />
        <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-white/5 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-white/5 to-transparent" />
      </div>

      <div className="relative z-10 w-full max-w-4xl">
        <div className="text-center mb-16 space-y-4">
          <h1 className="text-6xl md:text-7xl font-bold bg-gradient-to-r from-purple-400 via-blue-400 to-cyan-400 bg-clip-text text-transparent">
            Game Hub
          </h1>
          <p className="text-xl text-white/70">{t('chooseGame')}</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-12">
          <Link
            to="/cypher"
            className="group relative overflow-hidden rounded-2xl bg-gradient-to-br from-blue-600/20 to-purple-600/20 border border-blue-500/30 hover:border-blue-400/60 transition-all duration-300 p-8 text-left hover:scale-105 hover:shadow-2xl hover:shadow-blue-500/20 no-underline"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-blue-500/10 to-purple-500/10 group-hover:from-blue-500/20 group-hover:to-purple-500/20 transition-all duration-300" />
            <div className="relative z-10">
              <div className="text-5xl mb-4">🎤</div>
              <h2 className="text-3xl font-bold mb-2 text-white">{t('cypher')}</h2>
              <p className="text-white/80 mb-4">{t('undergroundWordRelay')}</p>
              <p className="text-sm text-white/60">{t('cypherDescription')}</p>
              <div className="mt-6 inline-block px-4 py-2 bg-blue-500/30 rounded-lg text-sm text-blue-300 group-hover:bg-blue-500/50 transition-colors">
                {t('play')}
              </div>
            </div>
          </Link>

          <Link
            to="/werbinich"
            className="group relative overflow-hidden rounded-2xl bg-gradient-to-br from-amber-600/20 to-red-600/20 border border-amber-500/30 hover:border-amber-400/60 transition-all duration-300 p-8 text-left hover:scale-105 hover:shadow-2xl hover:shadow-amber-500/20 no-underline"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-amber-500/10 to-red-500/10 group-hover:from-amber-500/20 group-hover:to-red-500/20 transition-all duration-300" />
            <div className="relative z-10">
              <div className="text-5xl mb-4">❓</div>
              <h2 className="text-3xl font-bold mb-2 text-white">{t('werBinIch')}</h2>
              <p className="text-white/80 mb-4">{t('riddleGame')}</p>
              <p className="text-sm text-white/60">{t('werBinIchDescription')}</p>
              <div className="mt-6 inline-block px-4 py-2 bg-amber-500/30 rounded-lg text-sm text-amber-300 group-hover:bg-amber-500/50 transition-colors">
                {t('play')}
              </div>
            </div>
          </Link>

          <Link
            to="/wavelength"
            className="group relative overflow-hidden rounded-2xl bg-gradient-to-br from-cyan-600/20 to-blue-600/20 border border-cyan-500/30 hover:border-cyan-400/60 transition-all duration-300 p-8 text-left hover:scale-105 hover:shadow-2xl hover:shadow-cyan-500/20 no-underline"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/10 to-blue-500/10 group-hover:from-cyan-500/20 group-hover:to-blue-500/20 transition-all duration-300" />
            <div className="relative z-10">
              <div className="text-5xl mb-4">🌊</div>
              <h2 className="text-3xl font-bold mb-2 text-white">{t('wavelength')}</h2>
              <p className="text-white/80 mb-4">{t('numberGuessingGame')}</p>
              <p className="text-sm text-white/60">{t('wavelengthDescription')}</p>
              <div className="mt-6 inline-block px-4 py-2 bg-cyan-500/30 rounded-lg text-sm text-cyan-300 group-hover:bg-cyan-500/50 transition-colors">
                {t('play')}
              </div>
            </div>
          </Link>

          <Link
            to="/schwedenraetsel"
            className="group relative overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-600/20 to-teal-600/20 border border-emerald-500/30 hover:border-emerald-400/60 transition-all duration-300 p-8 text-left hover:scale-105 hover:shadow-2xl hover:shadow-emerald-500/20 no-underline"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/10 to-teal-500/10 group-hover:from-emerald-500/20 group-hover:to-teal-500/20 transition-all duration-300" />
            <div className="relative z-10">
              <div className="text-5xl mb-4">🧩</div>
              <h2 className="text-3xl font-bold mb-2 text-white">{t('arrowWords')}</h2>
              <p className="text-white/80 mb-4">{t('soloPuzzle')}</p>
              <p className="text-sm text-white/60">{t('arrowWordsDescription')}</p>
              <div className="mt-6 inline-block px-4 py-2 bg-emerald-500/30 rounded-lg text-sm text-emerald-300 group-hover:bg-emerald-500/50 transition-colors">
                {t('play')}
              </div>
            </div>
          </Link>

          <Link
            to="/pokemonquiz"
            className="group relative overflow-hidden rounded-2xl bg-gradient-to-br from-red-600/20 to-yellow-600/20 border border-red-500/30 hover:border-red-400/60 transition-all duration-300 p-8 text-left hover:scale-105 hover:shadow-2xl hover:shadow-red-500/20 no-underline"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-red-500/10 to-yellow-500/10 group-hover:from-red-500/20 group-hover:to-yellow-500/20 transition-all duration-300" />
            <div className="relative z-10">
              <div className="text-5xl mb-4">⚡</div>
              <h2 className="text-3xl font-bold mb-2 text-white">{t('pokemonQuiz')}</h2>
              <p className="text-white/80 mb-4">{t('soloPuzzle')}</p>
              <p className="text-sm text-white/60">{t('pokemonQuizDescription')}</p>
              <div className="mt-6 inline-block px-4 py-2 bg-red-500/30 rounded-lg text-sm text-red-300 group-hover:bg-red-500/50 transition-colors">
                {t('play')}
              </div>
            </div>
          </Link>

        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-center">
          <div className="p-4 rounded-lg bg-white/5 border border-white/10">
            <div className="text-2xl font-bold text-purple-400">5</div>
            <p className="text-white/60 text-sm mt-1">{t('gamesAvailable')}</p>
          </div>
          <div className="p-4 rounded-lg bg-white/5 border border-white/10">
            <div className="text-2xl font-bold text-blue-400">∞</div>
            <p className="text-white/60 text-sm mt-1">{t('players')}</p>
          </div>
          <div className="p-4 rounded-lg bg-white/5 border border-white/10">
            <div className="text-2xl font-bold text-cyan-400">🌍</div>
            <p className="text-white/60 text-sm mt-1">{t('multilingual')}</p>
          </div>
        </div>
      </div>

      <LanguageSelector />
    </div>
  )
}
