import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchRandomPokemon } from '../games/pokemonquiz/api'
import { GENERATIONS } from '../games/pokemonquiz/generations'
import { scoreGenGuess, scoreNumberGuess } from '../games/pokemonquiz/scoring'
import type { PokemonRound, RoundResult } from '../games/pokemonquiz/types'

type Phase = 'gen' | 'number' | 'result'

export default function PokemonQuizGame() {
  const [round, setRound] = useState<PokemonRound | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [phase, setPhase] = useState<Phase>('gen')
  const [genGuess, setGenGuess] = useState<number | null>(null)
  const [numberInput, setNumberInput] = useState('')
  const [result, setResult] = useState<RoundResult | null>(null)
  const [totalScore, setTotalScore] = useState(0)
  const [roundCount, setRoundCount] = useState(0)

  useEffect(() => { document.title = 'Pokémon-Quiz' }, [])

  const loadRound = useCallback(async () => {
    setLoading(true)
    setError(null)
    setPhase('gen')
    setGenGuess(null)
    setNumberInput('')
    setResult(null)
    try {
      const next = await fetchRandomPokemon()
      setRound(next)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unbekannter Fehler')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadRound() }, [loadRound])

  const pickGen = (gen: number) => {
    setGenGuess(gen)
    setPhase('number')
  }

  const submitNumber = () => {
    const guess = Number(numberInput)
    if (!round || !genGuess || !Number.isFinite(guess) || numberInput.trim() === '') return
    const genPoints = scoreGenGuess(genGuess, round.generation)
    const numberPoints = scoreNumberGuess(guess, round.id)
    setResult({ genPoints, numberPoints, numberGuess: guess })
    setTotalScore(s => s + genPoints + numberPoints)
    setRoundCount(c => c + 1)
    setPhase('result')
  }

  const guessedRegion = GENERATIONS.find(g => g.gen === genGuess)?.region
  const actualRegion = round ? GENERATIONS.find(g => g.gen === round.generation)?.region : null

  return (
    <div className="min-h-screen overflow-x-hidden text-white">
      <div className="pointer-events-none fixed inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.08),transparent_32%),radial-gradient(circle_at_bottom_right,rgba(255,255,255,0.05),transparent_28%)]" />
        <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-white/5 to-transparent" />
      </div>

      <div className="relative z-10 mx-auto w-full max-w-2xl px-4 py-8 sm:py-12">
        <div className="mb-8 flex items-start justify-between gap-4">
          <div>
            <p className="section-kicker mb-2">Quiz</p>
            <h1 className="hero-title text-xl sm:text-2xl">Pokémon-Quiz</h1>
          </div>
          <Link to="/" className="action-ghost shrink-0 px-4 py-2 text-xs">
            Zurück
          </Link>
        </div>

        <div className="mb-5 flex flex-wrap items-center gap-x-5 gap-y-2 font-mono-ui text-[0.7rem] uppercase tracking-[0.16em] text-zinc-400">
          <span><span className="text-zinc-100">{roundCount}</span> Runden</span>
          <span><span className="text-zinc-100">{totalScore}</span> Punkte gesamt</span>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 sm:p-8">
          {loading && (
            <p className="py-16 text-center text-sm text-zinc-400">Lade Pokémon…</p>
          )}

          {!loading && error && (
            <div className="py-10 text-center">
              <p className="mb-4 text-sm text-[#ff8f8f]">{error}</p>
              <button type="button" onClick={loadRound} className="action-secondary px-5 py-2.5 text-xs">
                Erneut versuchen
              </button>
            </div>
          )}

          {!loading && !error && round && (
            <>
              <div className="mb-6 flex justify-center">
                <img
                  src={round.spriteUrl}
                  alt="Errate dieses Pokémon"
                  className="h-48 w-48 object-contain drop-shadow-[0_10px_25px_rgba(0,0,0,0.5)] sm:h-56 sm:w-56"
                />
              </div>

              {phase === 'gen' && (
                <>
                  <p className="mb-4 text-center text-sm text-zinc-300">Aus welcher Generation stammt dieses Pokémon?</p>
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-3">
                    {GENERATIONS.map(g => (
                      <button
                        key={g.gen}
                        type="button"
                        onClick={() => pickGen(g.gen)}
                        className="action-secondary px-3 py-3 text-xs"
                      >
                        Gen {g.gen}
                        <span className="mt-0.5 block text-[0.65rem] text-zinc-400">{g.region}</span>
                      </button>
                    ))}
                  </div>
                </>
              )}

              {phase === 'number' && (
                <>
                  <p className="mb-1 text-center text-sm text-zinc-300">
                    Deine Generation: <span className="text-zinc-100">Gen {genGuess} · {guessedRegion}</span>
                  </p>
                  <p className="mb-4 text-center text-sm text-zinc-300">Welche Pokédex-Nummer hat es genau?</p>
                  <div className="flex items-center justify-center gap-2">
                    <input
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={1025}
                      value={numberInput}
                      onChange={e => setNumberInput(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') submitNumber() }}
                      placeholder="#"
                      className="w-28 rounded-lg border border-white/15 bg-white/5 px-4 py-2.5 text-center text-lg text-white outline-none focus:border-white/40"
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={submitNumber}
                      disabled={numberInput.trim() === ''}
                      className="action-primary px-5 py-2.5 text-xs disabled:opacity-40"
                    >
                      Prüfen
                    </button>
                  </div>
                </>
              )}

              {phase === 'result' && result && (
                <div className="text-center">
                  <p className="mb-1 text-lg font-semibold capitalize text-zinc-100">
                    {round.name} · #{round.id}
                  </p>
                  <p className="mb-6 text-sm text-zinc-400">Gen {round.generation} · {actualRegion}</p>

                  <div className="mb-6 grid grid-cols-2 gap-3">
                    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                      <p className="font-mono-ui text-[0.65rem] uppercase tracking-[0.16em] text-zinc-500">Generation</p>
                      <p className="mt-1 text-2xl font-bold text-zinc-100">{result.genPoints}<span className="text-sm text-zinc-500">/3</span></p>
                      <p className="mt-1 text-xs text-zinc-500">geraten: Gen {genGuess}</p>
                    </div>
                    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                      <p className="font-mono-ui text-[0.65rem] uppercase tracking-[0.16em] text-zinc-500">Nummer</p>
                      <p className="mt-1 text-2xl font-bold text-zinc-100">{result.numberPoints}<span className="text-sm text-zinc-500">/3</span></p>
                      <p className="mt-1 text-xs text-zinc-500">geraten: #{result.numberGuess}</p>
                    </div>
                  </div>

                  <p className="mb-6 text-sm text-zinc-300">
                    Diese Runde: <span className="font-semibold text-zinc-100">{result.genPoints + result.numberPoints} / 6</span>
                  </p>

                  <button type="button" onClick={loadRound} className="action-primary px-6 py-2.5 text-xs">
                    Nächstes Pokémon
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
