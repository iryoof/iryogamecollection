import { useMemo, useState } from 'react'
import type { Socket } from 'socket.io-client'
import type { WavvelengthAck, WavvelengthGameState } from './types'

interface GameProps {
  socket: Socket
  gameState: WavvelengthGameState
  onError: (message: string) => void
}

export default function Game({ socket, gameState, onError }: GameProps) {
  const [selectedPlayerForQuestion, setSelectedPlayerForQuestion] = useState<string | null>(null)
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState('')
  const [selectedGuess, setSelectedGuess] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)

  const isSeeker = gameState.myId === gameState.seekerId
  const activeOtherPlayers = useMemo(
    () => gameState.players.filter(player => player.id !== gameState.seekerId && !player.isDisconnected),
    [gameState.players, gameState.seekerId]
  )
  const askedPlayerIds = useMemo(
    () => new Set(gameState.questionsAndAnswers.map(entry => entry.playerId)),
    [gameState.questionsAndAnswers]
  )

  const handleSubmitQuestion = () => {
    if (!selectedPlayerForQuestion) {
      onError('Bitte wähle einen Spieler.')
      return
    }
    if (!question.trim()) {
      onError('Bitte stelle eine Frage.')
      return
    }

    setLoading(true)
    socket.emit('wvl:ask-question', selectedPlayerForQuestion, question.trim(), (response?: WavvelengthAck) => {
      setLoading(false)
      if (response?.error) {
        onError(response.error)
        return
      }
      setQuestion('')
      setSelectedPlayerForQuestion(null)
    })
  }

  const handleSubmitAnswer = () => {
    if (!answer.trim()) {
      onError('Bitte gib eine Antwort ein.')
      return
    }

    setLoading(true)
    socket.emit('wvl:answer-question', answer.trim(), (response?: WavvelengthAck) => {
      setLoading(false)
      if (response?.error) {
        onError(response.error)
        return
      }
      setAnswer('')
    })
  }

  const handleMakeGuess = () => {
    if (selectedGuess === null) {
      onError('Bitte wähle eine Zahl.')
      return
    }

    setLoading(true)
    socket.emit('wvl:make-guess', selectedGuess, (response?: WavvelengthAck) => {
      setLoading(false)
      if (response?.error) {
        onError(response.error)
      }
    })
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen px-4 py-8">
      <div className="w-full max-w-4xl space-y-8">
        <div className="text-center space-y-3">
          <p className="section-kicker">Wavelength</p>
          <h1 className="hero-title text-[clamp(2.3rem,8vw,4.6rem)] leading-none">
            {isSeeker ? 'Du bist der Seeker' : 'Du kennst die Zahl'}
          </h1>
          <p className="text-white/70">Seeker: {gameState.seekerName}</p>
          {!isSeeker && !gameState.targetNumberHidden && (
            <p className="text-3xl font-bold text-white">Deine Zahl: {gameState.targetNumber}</p>
          )}
        </div>

        <div className="screen-shell rounded-[2rem] p-6 md:p-8 space-y-6">
          <div className="surface-panel rounded-[1.5rem] p-5 space-y-4 max-h-[26rem] overflow-y-auto">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-xl font-semibold text-white">Fragen & Antworten</h2>
              <span className="status-chip status-chip-muted">
                {gameState.questionsAndAnswers.length}/{activeOtherPlayers.length}
              </span>
            </div>

            {gameState.questionsAndAnswers.length === 0 ? (
              <p className="text-sm text-zinc-500 text-center py-6">Noch keine Fragen gestellt.</p>
            ) : (
              <div className="space-y-3">
                {gameState.questionsAndAnswers.map((entry, index) => (
                  <div key={`${entry.playerId}-${index}`} className="surface-panel-strong rounded-[1.25rem] p-4 space-y-2">
                    <p className="font-semibold text-white">{gameState.seekerName} → {entry.playerName}</p>
                    <p className="text-sm text-zinc-300">
                      <span className="text-zinc-500">Frage:</span> {entry.question}
                    </p>
                    <p className="text-sm text-zinc-300">
                      <span className="text-zinc-500">Antwort:</span> {entry.answer || 'Warte auf Antwort ...'}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {isSeeker ? (
            gameState.canMakeGuess ? (
              <div className="surface-panel rounded-[1.5rem] p-5 space-y-4">
                <div className="space-y-2">
                  <p className="section-kicker">Final Guess</p>
                  <h2 className="text-2xl font-semibold text-white">Zeit für deine Zahl</h2>
                  <p className="text-sm text-zinc-400">Du hast alle Antworten gesammelt. Was ist dein Tipp?</p>
                </div>

                <div className="grid grid-cols-5 gap-2">
                  {Array.from({ length: 10 }, (_, index) => index + 1).map(number => (
                    <button
                      key={number}
                      onClick={() => setSelectedGuess(number)}
                      className={`aspect-square rounded-2xl border-2 font-bold text-lg transition-all ${
                        selectedGuess === number
                          ? 'bg-white text-black border-white scale-[1.03]'
                          : 'bg-white/5 border-white/15 text-white hover:bg-white/10 hover:border-white/35'
                      }`}
                    >
                      {number}
                    </button>
                  ))}
                </div>

                <button
                  onClick={handleMakeGuess}
                  disabled={loading || selectedGuess === null}
                  className="action-primary w-full px-6 py-4 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? 'Prüfe Guess...' : 'Guess abgeben'}
                </button>
              </div>
            ) : (
              <div className="surface-panel rounded-[1.5rem] p-5 space-y-4">
                <div className="space-y-2">
                  <p className="section-kicker">Frage stellen</p>
                  <h2 className="text-2xl font-semibold text-white">Hol dir noch Hinweise</h2>
                  <p className="text-sm text-zinc-400">Du darfst jedem aktiven Mitspieler genau eine Frage stellen.</p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {activeOtherPlayers.map(player => {
                    const alreadyAsked = askedPlayerIds.has(player.id)
                    return (
                      <button
                        key={player.id}
                        onClick={() => setSelectedPlayerForQuestion(player.id)}
                        disabled={alreadyAsked}
                        className={`rounded-2xl border px-4 py-3 text-left transition ${
                          selectedPlayerForQuestion === player.id
                            ? 'border-white bg-white text-black'
                            : 'border-white/12 bg-white/[0.03] text-white'
                        } ${alreadyAsked ? 'opacity-45 cursor-not-allowed' : 'hover:border-white/30 hover:bg-white/[0.06]'}`}
                      >
                        {player.name}
                      </button>
                    )
                  })}
                </div>

                <input
                  type="text"
                  value={question}
                  onChange={event => setQuestion(event.target.value)}
                  placeholder="Zum Beispiel: Ist die Zahl eher hoch?"
                  className="w-full rounded-2xl px-4 py-4 text-base placeholder:text-zinc-600"
                />

                <button
                  onClick={handleSubmitQuestion}
                  disabled={loading || !selectedPlayerForQuestion || !question.trim()}
                  className="action-primary w-full px-6 py-4 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? 'Sende Frage...' : 'Frage senden'}
                </button>
              </div>
            )
          ) : gameState.canAnswerQuestion && gameState.pendingQuestion ? (
            <div className="surface-panel rounded-[1.5rem] p-5 space-y-4">
              <div className="space-y-2">
                <p className="section-kicker">Du bist dran</p>
                <h2 className="text-2xl font-semibold text-white">Antworte dem Seeker</h2>
                <p className="text-sm text-zinc-400">Frage: {gameState.pendingQuestion}</p>
              </div>

              <input
                type="text"
                value={answer}
                onChange={event => setAnswer(event.target.value)}
                placeholder="Schreibe deine Antwort..."
                className="w-full rounded-2xl px-4 py-4 text-base placeholder:text-zinc-600"
              />

              <button
                onClick={handleSubmitAnswer}
                disabled={loading || !answer.trim()}
                className="action-primary w-full px-6 py-4 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Sende Antwort...' : 'Antwort senden'}
              </button>
            </div>
          ) : gameState.hasAnsweredQuestion ? (
            <div className="metric-strip rounded-[1.5rem] p-5 text-sm text-zinc-400 space-y-1 text-center">
              <p className="text-zinc-200 font-semibold">Antwort abgegeben.</p>
              <p>Warte, bis der Seeker alle Hinweise gesammelt hat.</p>
            </div>
          ) : (
            <div className="metric-strip rounded-[1.5rem] p-5 text-sm text-zinc-400 space-y-1 text-center">
              <p className="text-zinc-200 font-semibold">Noch keine Frage für dich.</p>
              <p>Der Seeker entscheidet als Nächstes, wen er fragt.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
