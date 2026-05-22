import { useState } from 'react'
import type { Socket } from 'socket.io-client'
import type { WavvelengthAck, WavvelengthLobbyState } from './types'

interface VotingScreenProps {
  socket: Socket
  lobby: WavvelengthLobbyState
  selfPlayerId: string | null
  onError: (message: string) => void
}

export default function VotingScreen({ socket, lobby, selfPlayerId, onError }: VotingScreenProps) {
  const [selectedNumber, setSelectedNumber] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)

  const me = lobby.players.find(player => player.id === selfPlayerId)
  const activePlayers = lobby.players.filter(player => !player.isDisconnected)

  const handleSubmitVote = () => {
    if (selectedNumber === null) {
      onError('Bitte wähle eine Zahl.')
      return
    }

    setLoading(true)
    socket.emit('wvl:vote', selectedNumber, (response?: WavvelengthAck) => {
      setLoading(false)
      if (response?.error) {
        onError(response.error)
      }
    })
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen px-4 py-8">
      <div className="w-full max-w-2xl space-y-8">
        <div className="text-center space-y-3">
          <p className="section-kicker">Wavelength</p>
          <h1 className="hero-title text-[clamp(2.3rem,8vw,4.2rem)] leading-none">Zahl wählen</h1>
          <p className="text-white/70">
            Alle aktiven Spieler stimmen für eine Zahl von 1 bis 10 ab. Die Mehrheitszahl wird zum Ziel.
          </p>
        </div>

        {me?.isDisconnected && (
          <div className="alert-danger rounded-2xl px-4 py-3 text-sm">
            Deine Verbindung ist gerade unterbrochen. Bitte stelle sie wieder her.
          </div>
        )}

        <div className="screen-shell rounded-[2rem] p-6 md:p-8 space-y-6">
          <div className="grid grid-cols-5 gap-3">
            {Array.from({ length: 10 }, (_, index) => index + 1).map(number => (
              <button
                key={number}
                onClick={() => setSelectedNumber(number)}
                className={`aspect-square rounded-2xl border-2 font-bold text-lg transition-all ${
                  selectedNumber === number
                    ? 'bg-white text-black border-white scale-[1.03]'
                    : 'bg-white/5 border-white/15 text-white hover:bg-white/10 hover:border-white/35'
                }`}
              >
                {number}
              </button>
            ))}
          </div>

          <button
            onClick={handleSubmitVote}
            disabled={selectedNumber === null || loading}
            className="action-primary w-full px-6 py-4 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Sende Stimme...' : 'Abstimmung abgeben'}
          </button>

          <div className="metric-strip rounded-[1.5rem] p-5 text-sm text-zinc-400 space-y-1 text-center">
            <p>{activePlayers.length} aktive Spieler stimmen mit ab.</p>
            <p>Getrennte Spieler müssen nicht erst zurückkommen, damit die Runde weitergeht.</p>
          </div>
        </div>
      </div>
    </div>
  )
}
