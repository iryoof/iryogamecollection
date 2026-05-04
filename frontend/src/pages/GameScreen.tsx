import { useEffect, useRef, useState } from 'react'
import { Socket } from 'socket.io-client'
import { PageType } from '../App'
import type { GameSocketApi } from '../hooks/useGameSocket'
import { useTimer } from '../hooks/useTimer'
import TextInput from '../components/TextInput'
import TwoLineInput from '../components/TwoLineInput'
import Timer from '../components/Timer'
import PlayerStatusList from '../components/PlayerStatusList'
import { saveArchive } from '../services/archiveService'

interface GameScreenProps {
  socket: Socket | null
  onNavigate: (page: PageType) => void
  game: GameSocketApi
}

type GamePhase = 'waiting' | 'writing' | 'round-complete' | 'voting' | 'voting-results' | 'finished'

export default function GameScreen({ socket, onNavigate, game }: GameScreenProps) {
  const { gameState, submitText, submitVote, startGame, clearSession } = game
  const [phase, setPhase] = useState<GamePhase>('waiting')
  const [hasSubmitted, setHasSubmitted] = useState(false)
  const [promptText, setPromptText] = useState<string>('')
  const [votingOptions, setVotingOptions] = useState<string[]>([])
  const [voteResults, setVoteResults] = useState<number[]>([])
  const [hasVoted, setHasVoted] = useState(false)
  const hasRequestedState = useRef(false)
  const storedPlayerId = typeof window !== 'undefined' ? sessionStorage.getItem('cypher-player-id') : null
  const playerId = storedPlayerId || socket?.id || ''
  const isHost = gameState?.hostId === playerId
  const hasSubmittedCurrentRound = !!playerId && (gameState?.submittedPlayerIds?.includes(playerId) ?? false)
  const hasVotedCurrentRound = !!playerId && (gameState?.votedPlayerIds?.includes(playerId) ?? false)

  const shouldRunTimer = phase === 'writing' && (gameState?.settings?.timerEnabled ?? false)

  const { timeLeft, isRunning, reset, stop } = useTimer(
    gameState?.settings?.timerSeconds || 60,
    shouldRunTimer,
    () => {
      setPhase('waiting')
    }
  )

  useEffect(() => {
    if (!socket) return

    const savedPrompt = sessionStorage.getItem('cypher-round-prompt')
    if (savedPrompt) {
      try {
        const parsed = JSON.parse(savedPrompt)
        if (parsed?.prompt && !promptText) {
          setPromptText(parsed.prompt)
        }
      } catch {
        // ignore parse errors
      }
    }

    socket.on('game-ended', (archive) => {
      console.log('Game ended:', archive)
      saveArchive(archive)
      setPhase('finished')
      onNavigate('menu')
    })

    socket.on('round-started', (roundNumber, prompt) => {
      setPhase('writing')
      setHasSubmitted(false)
      setPromptText(prompt || '')
      sessionStorage.setItem('cypher-round-prompt', JSON.stringify({ roundNumber, prompt: prompt || '' }))
      if (gameState?.settings?.timerEnabled) {
        reset(gameState.settings.timerSeconds || 60)
      } else {
        stop()
      }
      console.log('Round started:', roundNumber)
    })

    socket.on('round-complete', () => {
      setHasSubmitted(hasSubmittedCurrentRound)
      setPhase('round-complete')
    })

    socket.on('round-archived', (archive) => {
      saveArchive(archive)
    })

    socket.on('voting-started', (options: string[]) => {
      setVotingOptions(options || [])
      setVoteResults([])
      setHasVoted(hasVotedCurrentRound)
      setPhase('voting')
    })

    socket.on('voting-complete', (archive, results: number[]) => {
      saveArchive(archive)
      setVotingOptions(archive?.finalTexts || [])
      setVoteResults(results || [])
      setPhase('voting-results')
    })

    return () => {
      socket.off('game-ended')
      socket.off('round-started')
      socket.off('round-complete')
      socket.off('round-archived')
      socket.off('voting-started')
      socket.off('voting-complete')
    }
  }, [socket, gameState?.settings?.timerEnabled, gameState?.settings?.timerSeconds, hasSubmittedCurrentRound, hasVotedCurrentRound, onNavigate, promptText, reset, stop])

  useEffect(() => {
    if (!socket?.connected) return
    if (hasRequestedState.current) return
    hasRequestedState.current = true
    socket.emit('request-state')
  }, [socket])

  useEffect(() => {
    if (!gameState) return

    if (gameState.votingActive) {
      setHasVoted(hasVotedCurrentRound)
      setPhase(currentPhase => currentPhase === 'voting-results' ? currentPhase : 'voting')
      return
    }

    if (!gameState.gameStarted || gameState.gameEnded) return

    setHasSubmitted(hasSubmittedCurrentRound)

    if (gameState.roundComplete) {
      setPhase('round-complete')
      return
    }

    setPhase(hasSubmittedCurrentRound ? 'waiting' : 'writing')
  }, [gameState, hasSubmittedCurrentRound, hasVotedCurrentRound])

  const handleTextSubmit = (text: string) => {
    if (!socket?.connected || hasSubmittedCurrentRound) return
    submitText(text)
    setHasSubmitted(true)
    setPhase('waiting')
  }

  const handleNextRound = () => {
    if (!socket?.connected) return
    socket.emit('next-round')
  }

  const handlePlayAgain = () => {
    setPhase('writing')
    setHasSubmitted(false)
    setPromptText('')
    startGame()
  }

  const handleEndGame = () => {
    if (!socket?.connected) return
    socket.emit('end-game')
  }

  const handleVote = (index: number) => {
    if (hasVoted) return
    submitVote(index)
    setHasVoted(true)
  }

  const handleSkipVoting = () => {
    if (!socket?.connected) return
    socket.emit('skip-voting')
  }

  if (!gameState) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen">
        <div className="screen-shell rounded-[2rem] px-8 py-10 text-center">
          <p className="section-kicker">Hold Tight</p>
          <p className="mt-3 text-zinc-400">Warte auf Spiel...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen px-4 py-8">
      {isHost && (
        <button
          onClick={handleEndGame}
          className="action-danger fixed top-4 left-4 z-20 px-4 py-3 text-[11px]"
        >
          Spiel beenden
        </button>
      )}
      <div className="w-full max-w-3xl space-y-6">
        <div className="text-center space-y-3">
          <p className="section-kicker">Live Session</p>
          <h1 className="hero-title text-[clamp(2.5rem,7vw,4.8rem)] leading-none">Cypher</h1>
          <div className="flex flex-wrap items-center justify-center gap-3 text-xs font-mono-ui uppercase tracking-[0.18em] text-zinc-500">
            <span>Lobby {gameState.lobbyCode}</span>
            <span className="h-1 w-1 rounded-full bg-white/20" />
            <span>Runde {gameState.currentRound}</span>
          </div>
        </div>

        {gameState.settings.timerEnabled && (
          <Timer
            timeLeft={timeLeft}
            isRunning={isRunning}
            timerEnabled={gameState.settings.timerEnabled}
          />
        )}

        <div className="screen-shell rounded-[2rem] p-6 md:p-8 space-y-6">
          {phase === 'voting' && (
            <div className="space-y-5">
              <div className="text-center space-y-2">
                <p className="section-kicker">Vote</p>
                <h2 className="text-3xl font-semibold text-white">Besten Text wählen</h2>
                <p className="text-sm text-zinc-500">Eine Stimme pro Spieler</p>
              </div>
              <div className="space-y-3">
                {votingOptions.map((text, i) => (
                  <div key={i} className="surface-panel rounded-[1.5rem] p-5 space-y-4">
                    <div className="text-sm leading-relaxed text-zinc-200 whitespace-pre-line">{text}</div>
                    <button
                      onClick={() => handleVote(i)}
                      disabled={hasVoted}
                      className="action-primary w-full px-4 py-3 text-xs disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Abstimmen
                    </button>
                  </div>
                ))}
              </div>
              {hasVoted && (
                <div className="text-center text-xs text-zinc-600 font-mono-ui uppercase tracking-[0.16em]">
                  Danke - warte auf die anderen Spieler.
                </div>
              )}
              {isHost && (
                <button
                  onClick={handleSkipVoting}
                  className="action-secondary w-full px-4 py-4 text-xs"
                >
                  Voting überspringen
                </button>
              )}
            </div>
          )}

          {phase === 'voting-results' && (
            <div className="space-y-5">
              <div className="text-center space-y-2">
                <p className="section-kicker">Result</p>
                <h2 className="text-3xl font-semibold text-white">Voting Ergebnis</h2>
              </div>
              <div className="space-y-3">
                {votingOptions.map((text, i) => {
                  const votes = voteResults[i] || 0
                  const maxVotes = Math.max(0, ...voteResults)
                  const isWinner = votes > 0 && votes === maxVotes
                  return (
                    <div
                      key={i}
                      className={`rounded-[1.5rem] p-5 space-y-3 border ${
                        isWinner
                          ? 'bg-white/[0.08] border-white/30'
                          : 'bg-white/[0.03] border-white/10'
                      }`}
                    >
                      <div className="text-sm text-zinc-200 whitespace-pre-line">{text}</div>
                      <div className="section-kicker text-zinc-400">
                        Stimmen {votes}
                      </div>
                    </div>
                  )
                })}
              </div>
              <button
                onClick={() => {
                  clearSession()
                  onNavigate('menu')
                }}
                className="action-secondary w-full px-6 py-4 text-sm"
              >
                Zum Menü
              </button>
            </div>
          )}
          {phase === 'writing' && (
            <div className="space-y-5">
              <div className="text-center space-y-2">
                <p className="section-kicker">Write</p>
                <h2 className="text-3xl font-semibold text-white">Schreibe deine Zeilen</h2>
                {promptText && (
                  <p className="text-sm text-zinc-500">
                    Du reimst auf <span className="text-zinc-100">"{promptText}"</span>
                  </p>
                )}
              </div>

              {gameState.currentRound === 1 ? (
                <TwoLineInput
                  onSubmit={handleTextSubmit}
                  isDisabled={hasSubmitted}
                  placeholder1="Zeile 1..."
                  placeholder2="Zeile 2..."
                />
              ) : (
                <TextInput
                  onSubmit={handleTextSubmit}
                  maxLines={1}
                  placeholder="Schreibe eine Zeile..."
                  isDisabled={hasSubmitted}
                />
              )}

              {hasSubmitted && (
                <div className="alert-surface rounded-2xl px-4 py-3 text-center text-sm text-zinc-300">
                  Text eingereicht. Warte auf die anderen...
                </div>
              )}

              <PlayerStatusList
                players={gameState.players}
                submittedPlayerIds={gameState.submittedPlayerIds || []}
                disconnectedPlayerIds={gameState.disconnectedPlayerIds || []}
                selfId={playerId}
              />
            </div>
          )}

          {phase === 'round-complete' && (
            <div className="text-center space-y-5">
              <div className="space-y-2">
                <p className="section-kicker">Round Complete</p>
                <h2 className="text-3xl font-semibold text-white">Runde beendet</h2>
                {gameState.maxRounds && gameState.maxRounds > 0 && gameState.currentRound >= gameState.maxRounds ? (
                  <p className="text-sm text-zinc-500">Letzte Runde abgeschlossen.</p>
                ) : (
                  <p className="text-sm text-zinc-500">Bereit für die nächste Runde?</p>
                )}
              </div>

              {isHost ? (
                <div className="space-y-3 pt-2">
                  <button
                    onClick={handleEndGame}
                    className="action-primary w-full px-6 py-4 text-sm"
                  >
                    Beenden und abstimmen
                  </button>
                  <button
                    onClick={handleNextRound}
                    disabled={!!gameState.maxRounds && gameState.maxRounds > 0 && gameState.currentRound >= gameState.maxRounds}
                    className="action-secondary w-full px-6 py-4 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Weiterspielen
                  </button>
                </div>
              ) : (
                <div className="text-xs text-zinc-600 font-mono-ui uppercase tracking-[0.16em]">
                  Warte auf den Host...
                </div>
              )}
            </div>
          )}

          {phase === 'waiting' && (
            <div className="text-center space-y-5">
              <div className="space-y-2">
                <p className="section-kicker">Hold</p>
                <p className="text-xl text-zinc-300">Warte auf die anderen Spieler...</p>
              </div>
              <div className="flex justify-center space-x-2">
                {gameState.players.map((_, i) => (
                  <div
                    key={i}
                    className="h-2.5 w-10 rounded-full bg-white/10 animate-pulse-line"
                    style={{ animationDelay: `${i * 0.14}s` }}
                  />
                ))}
              </div>
              <PlayerStatusList
                players={gameState.players}
                submittedPlayerIds={gameState.submittedPlayerIds || []}
                disconnectedPlayerIds={gameState.disconnectedPlayerIds || []}
                selfId={playerId}
              />
            </div>
          )}

          {phase === 'finished' && (
            <div className="text-center space-y-5">
              <div className="space-y-2">
                <p className="section-kicker">Archive Stored</p>
                <h2 className="text-3xl font-semibold text-white">Spiel vorbei</h2>
                <p className="text-sm text-zinc-500">Das Spiel wurde archiviert.</p>
              </div>
              <div className="space-y-3 pt-2">
                <button
                  onClick={handlePlayAgain}
                  className="action-primary w-full px-6 py-4 text-sm"
                >
                  Nochmal spielen
                </button>
                <button
                  onClick={() => { clearSession(); onNavigate('menu') }}
                  className="action-secondary w-full px-6 py-4 text-sm"
                >
                  Zum Menü
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="screen-shell rounded-[2rem] p-5 md:p-6">
          <div className="flex items-center justify-between mb-4 gap-4 flex-wrap">
            <div>
              <p className="section-kicker">Crew</p>
              <h3 className="text-2xl font-semibold text-white">Spieler im Spiel</h3>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {gameState.players.map(player => (
              <div
                key={player.id}
                className={`rounded-[1.25rem] p-3 text-center text-sm font-semibold transition border ${
                  player.isReady
                    ? 'bg-white/[0.08] text-white border-white/24'
                    : 'bg-white/[0.03] text-zinc-500 border-white/10'
                }`}
              >
                {player.nickname}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
