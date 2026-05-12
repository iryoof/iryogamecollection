import { FormEvent, useMemo, useState } from 'react'
import type { Socket } from 'socket.io-client'
import Notepad from './Notepad'
import type { WerBinIchAck, WerBinIchGameState } from './types'

interface GameProps {
  socket: Socket
  game: WerBinIchGameState
  myName: string
  onLeave: () => void
}

export default function Game({ socket, game, myName, onLeave }: GameProps) {
  const [word, setWord] = useState('')
  const [newWordTarget, setNewWordTarget] = useState<string | null>(null)
  const [newWord, setNewWord] = useState('')
  const [showSolvedModal, setShowSolvedModal] = useState(false)
  const [error, setError] = useState('')

  const targetPlayer = useMemo(
    () => game.others.find(player => player.id === newWordTarget) || null,
    [game.others, newWordTarget]
  )

  const handleSubmitWord = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    socket.emit('game:submitWord', { word: word.trim() }, (response?: WerBinIchAck) => {
      if (response?.error) {
        setError(response.error)
        return
      }
      setError('')
      setWord('')
    })
  }

  const handleSolve = () => {
    socket.emit('game:solve', (response?: WerBinIchAck) => {
      if (response?.error) {
        setError(response.error)
        return
      }
      setError('')
      setShowSolvedModal(true)
    })
  }

  const handleWriteNewWord = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    socket.emit(
      'game:writeNewWord',
      { targetId: newWordTarget, word: newWord.trim() },
      (response?: WerBinIchAck) => {
        if (response?.error) {
          setError(response.error)
          return
        }
        setError('')
        setNewWordTarget(null)
        setNewWord('')
      }
    )
  }

  if (game.state === 'writing' && game.needsToWrite) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen px-4 py-8">
        <div className="w-full max-w-2xl space-y-6">
          <div className="text-center space-y-3">
            <p className="section-kicker">Schreibphase</p>
            <h1 className="hero-title text-[clamp(2.4rem,8vw,4.6rem)] leading-none">Wer bin ich?</h1>
          </div>

          <div className="screen-shell rounded-[2rem] p-6 md:p-8 space-y-6 text-center">
            <div className="space-y-2">
              <p className="section-kicker">Dein Ziel</p>
              <h2 className="text-3xl font-semibold text-white">Zettel schreiben</h2>
              <p className="text-sm text-zinc-500">
                Du schreibst für <span className="text-zinc-100">{game.writeForPlayer}</span>
              </p>
            </div>

            <form onSubmit={handleSubmitWord} className="space-y-4">
              <input
                type="text"
                placeholder="Figur oder Person eingeben..."
                value={word}
                onChange={event => setWord(event.target.value)}
                maxLength={40}
                autoFocus
                required
                className="w-full rounded-2xl px-4 py-4 text-base placeholder:text-zinc-600"
              />
              <button
                type="submit"
                className="action-primary w-full px-6 py-4 text-sm"
              >
                Abschicken
              </button>
            </form>

            {error && (
              <div className="alert-danger rounded-2xl px-4 py-3 text-sm">
                {error}
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  if (game.state === 'writing' && !game.needsToWrite) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen px-4 py-8">
        <div className="screen-shell rounded-[2rem] px-8 py-10 text-center max-w-lg w-full space-y-4">
          <div className="mx-auto h-10 w-10 rounded-full border-2 border-white/10 border-t-white animate-spin" />
          <p className="section-kicker">Warten</p>
          <h2 className="text-3xl font-semibold text-white">Warte auf die anderen...</h2>
          <p className="text-sm text-zinc-500">Dein Zettel wurde abgeschickt.</p>
          {error && (
            <div className="alert-danger rounded-2xl px-4 py-3 text-sm">
              {error}
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen px-4 py-8">
      <div className="w-full max-w-5xl space-y-6">
        <div className="text-center space-y-3">
          <p className="section-kicker">Rätselphase</p>
          <h1 className="hero-title text-[clamp(2.4rem,8vw,4.8rem)] leading-none">Wer bin ich?</h1>
          <div className="flex flex-wrap items-center justify-center gap-3 text-xs font-mono-ui uppercase tracking-[0.18em] text-zinc-500">
            <span>Spieler {game.players.length}</span>
            <span className="h-1 w-1 rounded-full bg-white/20" />
            <span>{myName}</span>
          </div>
        </div>

        {error && (
          <div className="alert-danger rounded-2xl px-4 py-3 text-sm">
            {error}
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
          <div className="screen-shell rounded-[2rem] p-6 md:p-8 space-y-6">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <p className="section-kicker">Tafel</p>
                <h2 className="text-3xl font-semibold text-white">Die anderen Spieler</h2>
              </div>
              {!game.iSolved ? (
                <button
                  className="action-primary px-6 py-4 text-sm"
                  onClick={handleSolve}
                >
                  Gelöst!
                </button>
              ) : (
                <span className="status-chip border-emerald-400/30 bg-emerald-400/10 text-emerald-200">
                  Gelöst
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {game.others.map(player => (
                <div
                  key={player.id}
                  className={`rounded-[1.5rem] p-5 border space-y-4 ${
                    player.solved
                      ? 'bg-emerald-500/8 border-emerald-400/20'
                      : 'surface-panel border-white/10'
                  }`}
                >
                  <div className="space-y-1">
                    <p className="section-kicker">
                      {player.isDisconnected ? 'Getrennt' : player.solved ? 'Gelöst' : 'Offen'}
                    </p>
                    <h3 className="text-xl font-semibold text-white">{player.name}</h3>
                  </div>
                  <div className="min-h-[3rem] text-lg font-semibold text-zinc-200 break-words">
                    {player.word || '...'}
                  </div>
                  {player.solved && (
                    <button
                      className="action-secondary w-full px-4 py-3 text-xs"
                      onClick={() => {
                        setNewWordTarget(player.id)
                        setNewWord('')
                      }}
                    >
                      Neues Wort geben
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-6">
            <div className="screen-shell rounded-[2rem] p-5 space-y-4">
              <div>
                <p className="section-kicker">Dein Status</p>
                <h3 className="text-2xl font-semibold text-white">Selbstcheck</h3>
              </div>

              {!game.iSolved ? (
                <div className="metric-strip rounded-[1.5rem] p-5 text-sm text-zinc-400">
                  Sobald du dein Wort erraten hast, kannst du auf <span className="text-zinc-100">Gelöst!</span> drücken.
                </div>
              ) : (
                <div className="space-y-3 rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-5">
                  <p className="section-kicker">Dein Wort</p>
                  <div className="text-2xl font-semibold text-white break-words">{game.myWord}</div>
                  <p className="text-sm text-zinc-500">
                    Geschrieben von <span className="text-zinc-100">{game.myWordAuthor}</span>
                  </p>
                </div>
              )}
            </div>

            <div className="screen-shell rounded-[2rem] p-5 space-y-4">
              <div>
                <p className="section-kicker">Teilnehmer</p>
                <h3 className="text-2xl font-semibold text-white">Am Tisch</h3>
              </div>
              <div className="grid grid-cols-1 gap-3">
                {game.players.map(player => (
                  <div
                    key={player.id}
                    className="surface-panel-strong rounded-[1.25rem] px-4 py-4 flex items-center justify-between gap-3"
                  >
                    <span className="font-semibold text-zinc-100">{player.name}</span>
                    <div className="flex items-center gap-2">
                      {player.isDisconnected && (
                        <span className="status-chip border-yellow-400/30 bg-yellow-400/10 text-yellow-200">
                          Getrennt
                        </span>
                      )}
                      {player.isHost && (
                        <span className="status-chip border-white/18 bg-white/10 text-zinc-100">
                          Host
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <button
              className="action-ghost w-full px-6 py-4 text-sm"
              onClick={onLeave}
            >
              Spiel verlassen
            </button>
          </div>
        </div>
      </div>

      {showSolvedModal && game.iSolved && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-4"
          onClick={() => setShowSolvedModal(false)}
        >
          <div
            className="screen-shell w-full max-w-md rounded-[2rem] p-6 text-center space-y-4"
            onClick={event => event.stopPropagation()}
          >
            <p className="section-kicker">Richtig geraten</p>
            <h3 className="text-3xl font-semibold text-white">Stark.</h3>
            <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.04] px-5 py-6 space-y-2">
              <div className="text-3xl font-semibold text-white break-words">{game.myWord}</div>
              <p className="text-sm text-zinc-500">
                Geschrieben von <span className="text-zinc-100">{game.myWordAuthor}</span>
              </p>
            </div>
            <button
              className="action-primary w-full px-6 py-4 text-sm"
              onClick={() => setShowSolvedModal(false)}
            >
              OK
            </button>
          </div>
        </div>
      )}

      {newWordTarget && targetPlayer && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-4"
          onClick={() => setNewWordTarget(null)}
        >
          <div
            className="screen-shell w-full max-w-md rounded-[2rem] p-6 space-y-5"
            onClick={event => event.stopPropagation()}
          >
            <div className="space-y-2 text-center">
              <p className="section-kicker">Neues Wort</p>
              <h3 className="text-3xl font-semibold text-white">Frisches Rätsel</h3>
              <p className="text-sm text-zinc-500">
                Für <span className="text-zinc-100">{targetPlayer.name}</span>
              </p>
            </div>

            <form onSubmit={handleWriteNewWord} className="space-y-4">
              <input
                type="text"
                placeholder="Neues Wort..."
                value={newWord}
                onChange={event => setNewWord(event.target.value)}
                maxLength={40}
                autoFocus
                required
                className="w-full rounded-2xl px-4 py-4 text-base placeholder:text-zinc-600"
              />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  className="action-secondary px-6 py-4 text-sm"
                  onClick={() => setNewWordTarget(null)}
                >
                  Abbrechen
                </button>
                <button
                  type="submit"
                  className="action-primary px-6 py-4 text-sm"
                >
                  Abschicken
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <Notepad />
    </div>
  )
}
