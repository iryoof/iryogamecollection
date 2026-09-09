export interface PokemonRound {
  id: number
  name: string
  spriteUrl: string
  generation: number
}

export interface RoundResult {
  genPoints: number
  numberPoints: number
  numberGuess: number
}
