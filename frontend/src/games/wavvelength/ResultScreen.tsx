import type { Socket } from 'socket.io-client'
import type { WavvelengthAck, WavvelengthGameState } from './types'

interface ResultScreenProps {
  socket: Socket
  gameState: WavvelengthGameState
  onError: (message: string) => void
}

export default function ResultScreen({ socket, gameState, onError }: ResultScreenProps) {
  const isHost = gameState.isHost
  const isCorrect = !!gameState.isCorrect
  const seekerGuess = gameState.seekerGuess ?? '—'

  const handlePlayAgain = () => {
    socket.emit('wvl:play-again', (response?: WavvelengthAck) => {
      if (response?.error) {
        onError(response.error)
      }
    })
  }

  const handleEndGame = () => {
    socket.emit('wvl:end-game', (response?: WavvelengthAck) => {
      if (response?.error) {
        onError(response.error)
      }
    })
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen px-4 py-8">
      <div className="w-full max-w-3xl space-y-8">
        <div className="text-center space-y-4">
          <p className="section-kicker">Wavelength</p>
          <h1 className={`hero-title text-[clamp(2.6rem,9vw,5rem)] leading-none ${isCorrect ? 'text-white' : 'text-zinc-100'}`}>
            {isCorrect ? 'Treffer' : 'Knapp daneben'}
          </h1>
          <p className="text-white/70 text-lg">
            {gameState.seekerName} tippte auf {seekerGuess}. Die richtige Zahl war {gameState.targetNumber}.
          </p>
        </div>

        <div className="screen-shell rounded-[2rem] p-6 md:p-8 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="surface-panel rounded-[1.5rem] p-4 text-center">
              <p className="section-kicker">Seeker</p>
              <p className="mt-2 text-xl font-semibold text-white">{gameState.seekerName}</p>
            </div>
            <div className="surface-panel rounded-[1.5rem] p-4 text-center">
              <p className="section-kicker">Zielzahl</p>
              <p className="mt-2 text-3xl font-bold text-white">{gameState.targetNumber}</p>
            </div>
            <div className="surface-panel rounded-[1.5rem] p-4 text-center">
              <p className="section-kicker">Guess</p>
              <p className="mt-2 text-3xl font-bold text-white">{seekerGuess}</p>
            </div>
            <div className="surface-panel rounded-[1.5rem] p-4 text-center">
              <p className="section-kicker">Fragen</p>
              <p className="mt-2 text-3xl font-bold text-white">{gameState.questionsAndAnswers.length}</p>
            </div>
          </div>

          {gameState.questionsAndAnswers.length > 0 && (
            <div className="surface-panel rounded-[1.5rem] p-5 space-y-4">
              <h2 className="text-xl font-semibold text-white">Rundenverlauf</h2>
              <div className="space-y-3 max-h-72 overflow-y-auto">
                {gameState.questionsAndAnswers.map((entry, index) => (
                  <div key={`${entry.playerId}-${index}`} className="surface-panel-strong rounded-[1.25rem] p-4 space-y-2">
                    <p className="font-semibold text-white">{index + 1}. {gameState.seekerName} → {entry.playerName}</p>
                    <p className="text-sm text-zinc-300">
                      <span className="text-zinc-500">Frage:</span> {entry.question}
                    </p>
                    <p className="text-sm text-zinc-300">
                      <span className="text-zinc-500">Antwort:</span> {entry.answer}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-3 pt-2">
            {isHost ? (
              <>
                <button onClick={handlePlayAgain} className="action-primary w-full px-6 py-4 text-sm">
                  Neue Runde
                </button>
                <button onClick={handleEndGame} className="action-danger w-full px-6 py-4 text-sm">
                  Spiel beenden
                </button>
              </>
            ) : (
              <div className="metric-strip rounded-[1.5rem] p-5 text-sm text-zinc-400 text-center">
                Warte auf den Host für die nächste Entscheidung.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
