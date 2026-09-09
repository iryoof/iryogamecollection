import { MAX_DEX_NUMBER, generationForId } from './generations'
import type { PokemonRound } from './types'

/**
 * Avoids showing the same Pokémon twice in a row, the same way
 * kreuzwortraetsel's newPuzzle() avoids an immediate repeat puzzle.
 */
let lastId = -1

function randomId(): number {
  let id = Math.floor(Math.random() * MAX_DEX_NUMBER) + 1
  if (MAX_DEX_NUMBER > 1 && id === lastId) id = (id % MAX_DEX_NUMBER) + 1
  lastId = id
  return id
}

interface SpeciesName {
  name: string
  language: { name: string }
}

export async function fetchRandomPokemon(): Promise<PokemonRound> {
  const id = randomId()
  const [pokemonRes, speciesRes] = await Promise.all([
    fetch(`https://pokeapi.co/api/v2/pokemon/${id}`),
    fetch(`https://pokeapi.co/api/v2/pokemon-species/${id}`),
  ])
  if (!pokemonRes.ok) throw new Error(`PokeAPI-Fehler (${pokemonRes.status})`)
  if (!speciesRes.ok) throw new Error(`PokeAPI-Fehler (${speciesRes.status})`)
  const data = await pokemonRes.json()
  const species = await speciesRes.json()
  const spriteUrl: string | undefined =
    data?.sprites?.other?.['official-artwork']?.front_default ?? data?.sprites?.front_default
  if (!spriteUrl) throw new Error('Kein Bild für dieses Pokémon gefunden')
  const germanName = (species?.names as SpeciesName[] | undefined)?.find(
    n => n.language.name === 'de'
  )?.name
  return {
    id,
    name: germanName ?? data.name,
    spriteUrl,
    generation: generationForId(id),
  }
}
