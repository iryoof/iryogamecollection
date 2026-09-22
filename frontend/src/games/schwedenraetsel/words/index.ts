import type { WordEntry } from '../types'
import { geografie } from './geografie'
import { natur } from './natur'
import { alltag } from './alltag'
import { kulturSport } from './kulturSport'
import { wissenGeschichte } from './wissenGeschichte'
import { menschSprache } from './menschSprache'
import { grundwortschatz } from './grundwortschatz'
import { grundwortschatz2 } from './grundwortschatz2'
import { grundwortschatz3 } from './grundwortschatz3'
import { grundwortschatz4 } from './grundwortschatz4'
import { grundwortschatz5 } from './grundwortschatz5'
import { grundwortschatz6 } from './grundwortschatz6'
import { grundwortschatz7 } from './grundwortschatz7'
import { grundwortschatz8 } from './grundwortschatz8'
import { grundwortschatz9 } from './grundwortschatz9'

// Aus Wikidata geerntet, siehe scripts/harvest-wikidata.mjs. Die Dateien tragen
// die Ids der bestehenden Themen und haengen sich damit an diese an.
import { wdBerge } from './wdBerge'
import { wdBerufe } from './wdBerufe'
import { wdElemente } from './wdElemente'
import { wdEssen } from './wdEssen'
import { wdFluesse } from './wdFluesse'
import { wdInseln } from './wdInseln'
import { wdInstrumente } from './wdInstrumente'
import { wdKleidung } from './wdKleidung'
import { wdMeere } from './wdMeere'
import { wdOrteDe } from './wdOrteDe'
import { wdSaeuger } from './wdSaeuger'
import { wdSeen } from './wdSeen'
import { wdSport } from './wdSport'
import { wdSprachen } from './wdSprachen'
import { wdStaedte } from './wdStaedte'
import { wdTiere } from './wdTiere'
import { wdVornamen } from './wdVornamen'
import { wdWerkzeug } from './wdWerkzeug'


/** A raw pool entry: [Lösung, Frage]. Umlauts are written normally here. */
export type RawEntry = [string, string]

export interface Category {
  id: string
  label: string
  entries: RawEntry[]
  /**
   * 'wikidata' für die maschinell erzeugten Dateien. scripts/harvest-wikidata.mjs
   * blendet sie beim Entdoppeln aus — sonst hielte der zweite Lauf den eigenen
   * Ertrag vom ersten für bestehende Wörter und schriebe leere Dateien.
   */
  source?: 'wikidata'
  /**
   * Always in the pool and not offered as a theme. A gapless grid needs a lot
   * of short words to close up, and picking a single theme must not leave the
   * generator without them.
   */
  always?: boolean
}

/**
 * Crossword grids only hold A-Z, so umlauts are expanded the way they are on a
 * German crossword: Ä -> AE, ß -> SS. Doing it here means the category files
 * can be written in plain German and stay readable.
 */
export const normaliseAnswer = (answer: string): string =>
  answer
    .toUpperCase()
    .replace(/Ä/g, 'AE')
    .replace(/Ö/g, 'OE')
    .replace(/Ü/g, 'UE')
    .replace(/ß/g, 'SS')
    .replace(/[^A-Z]/g, '')

export const CATEGORIES: Category[] = [
  geografie,
  natur,
  alltag,
  kulturSport,
  wissenGeschichte,
  menschSprache,
  grundwortschatz,
  grundwortschatz2,
  grundwortschatz3,
  grundwortschatz4,
  grundwortschatz5,
  grundwortschatz6,
  grundwortschatz7,
  grundwortschatz8,
  grundwortschatz9,
  wdBerge,
  wdBerufe,
  wdElemente,
  wdEssen,
  wdFluesse,
  wdInseln,
  wdInstrumente,
  wdKleidung,
  wdMeere,
  wdOrteDe,
  wdSaeuger,
  wdSeen,
  wdSport,
  wdSprachen,
  wdStaedte,
  wdTiere,
  wdVornamen,
  wdWerkzeug
]

/**
 * The categories offered as themes in the menu.
 *
 * Several files can share one id — the handwritten categories and the ones
 * harvested from Wikidata feed the same themes. The menu must still show each
 * theme once, so only the first file per id makes it into the list.
 */
export const THEMES: Category[] = CATEGORIES.filter(
  (category, index, all) =>
    !category.always && all.findIndex((other) => other.id === category.id) === index
)

/**
 * Builds the pool for the selected categories. Duplicate solutions are dropped
 * — the same answer twice in one grid reads like a mistake, and a duplicate
 * would also let the generator cross a word with itself.
 */
export const buildPool = (categoryIds?: string[]): WordEntry[] => {
  const selected = categoryIds?.length
    ? CATEGORIES.filter((category) => category.always || categoryIds.includes(category.id))
    : CATEGORIES

  const seen = new Set<string>()
  const pool: WordEntry[] = []

  for (const category of selected) {
    for (const [answer, clue] of category.entries) {
      const normalised = normaliseAnswer(answer)
      if (normalised.length < 3 || seen.has(normalised)) continue
      seen.add(normalised)
      pool.push({ answer: normalised, clue, category: category.label })
    }
  }

  return pool
}
