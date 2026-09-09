export function scoreGenGuess(guess: number, actual: number): number {
  return guess === actual ? 3 : 0
}

export function scoreNumberGuess(guess: number, actual: number): number {
  const diff = Math.abs(guess - actual)
  if (diff === 0) return 3
  if (diff <= 10) return 2
  if (diff <= 25) return 1
  return 0
}
