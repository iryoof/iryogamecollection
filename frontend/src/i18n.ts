import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

import en from './locales/en.json'
import de from './locales/de.json'
import fr from './locales/fr.json'

const LANGUAGE_STORAGE_KEY = 'iryogamecollection:language'
const SUPPORTED_LANGUAGES = ['de', 'en', 'fr'] as const

const readInitialLanguage = () => {
  if (typeof window === 'undefined') return 'de'

  const queryLanguage = new URLSearchParams(window.location.search).get('lang')
  if (queryLanguage && SUPPORTED_LANGUAGES.includes(queryLanguage as typeof SUPPORTED_LANGUAGES[number])) {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, queryLanguage)
    return queryLanguage
  }

  const storedLanguage = localStorage.getItem(LANGUAGE_STORAGE_KEY)
  if (storedLanguage && SUPPORTED_LANGUAGES.includes(storedLanguage as typeof SUPPORTED_LANGUAGES[number])) {
    return storedLanguage
  }

  return 'de'
}

const resources = {
  en: {
    translation: en
  },
  de: {
    translation: de
  },
  fr: {
    translation: fr
  }
}

i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: readInitialLanguage(),
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false
    }
  })

i18n.on('languageChanged', lng => {
  if (typeof window === 'undefined') return
  localStorage.setItem(LANGUAGE_STORAGE_KEY, lng)
})

export default i18n
