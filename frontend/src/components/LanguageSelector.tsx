import { useState } from 'react'
import { useTranslation } from 'react-i18next'

const LANGUAGE_STORAGE_KEY = 'iryogamecollection:language'

export default function LanguageSelector() {
  const { t, i18n } = useTranslation()
  const [open, setOpen] = useState(false)

  const changeLanguage = (lng: 'de' | 'en' | 'fr') => {
    i18n.changeLanguage(lng)
    if (typeof window !== 'undefined') {
      localStorage.setItem(LANGUAGE_STORAGE_KEY, lng)
      const url = new URL(window.location.href)
      url.searchParams.set('lang', lng)
      window.history.replaceState({}, '', url.toString())
    }
    setOpen(false)
  }

  return (
    <div className="fixed bottom-8 right-8 z-[100]">
      <div className="relative">
        <button
          onClick={() => setOpen(current => !current)}
          className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white px-6 py-3 rounded-xl border-2 border-white/30 backdrop-blur-sm transition-all duration-200 font-semibold shadow-lg hover:shadow-xl transform hover:scale-105"
        >
          {t('language')}
        </button>
        {open && (
          <div className="absolute bottom-full right-0 mb-3 bg-black/95 border-2 border-white/20 rounded-xl backdrop-blur-sm min-w-[140px] shadow-2xl">
            <button
              onClick={() => changeLanguage('de')}
              className="block w-full text-left px-4 py-3 text-white hover:bg-white/10 first:rounded-t-xl transition-colors font-medium"
            >
              🇩🇪 Deutsch
            </button>
            <button
              onClick={() => changeLanguage('en')}
              className="block w-full text-left px-4 py-3 text-white hover:bg-white/10 transition-colors font-medium"
            >
              🇬🇧 English
            </button>
            <button
              onClick={() => changeLanguage('fr')}
              className="block w-full text-left px-4 py-3 text-white hover:bg-white/10 last:rounded-b-xl transition-colors font-medium"
            >
              🇫🇷 Français
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
