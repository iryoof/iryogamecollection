import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

import en from './locales/en.json'
import de from './locales/de.json'
import fr from './locales/fr.json'

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
    lng: 'de', // default language
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false
    }
  })

export default i18n