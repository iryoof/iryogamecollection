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

/** A raw pool entry: [Lösung, Frage]. Umlauts are written normally here. */
export type RawEntry = [string, string]

export interface Category {
  id: string
  label: string
  entries: RawEntry[]
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
  grundwortschatz9
]

/** The categories offered as themes in the menu. */
export const THEMES: Category[] = CATEGORIES.filter((category) => !category.always)

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
