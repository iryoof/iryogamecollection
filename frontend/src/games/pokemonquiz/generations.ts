export interface GenerationRange {
  gen: number
  region: string
  start: number
  end: number
}

/**
 * National-dex number ranges per generation. Static rather than fetched from
 * PokeAPI's /generation endpoint — these boundaries are stable (last moved
 * with Scarlet/Violet's DLC) and this saves an extra request every round.
 */
export const GENERATIONS: GenerationRange[] = [
  { gen: 1, region: 'Kanto', start: 1, end: 151 },
  { gen: 2, region: 'Johto', start: 152, end: 251 },
  { gen: 3, region: 'Hoenn', start: 252, end: 386 },
  { gen: 4, region: 'Sinnoh', start: 387, end: 493 },
  { gen: 5, region: 'Einall', start: 494, end: 649 },
  { gen: 6, region: 'Kalos', start: 650, end: 721 },
  { gen: 7, region: 'Alola', start: 722, end: 809 },
  { gen: 8, region: 'Galar', start: 810, end: 905 },
  { gen: 9, region: 'Paldea', start: 906, end: 1025 },
]

export const MAX_DEX_NUMBER = GENERATIONS[GENERATIONS.length - 1].end

export function generationForId(id: number): number {
  const match = GENERATIONS.find(g => id >= g.start && id <= g.end)
  return match?.gen ?? GENERATIONS[GENERATIONS.length - 1].gen
}
