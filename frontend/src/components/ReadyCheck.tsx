import { Player } from '../../../shared/types'

interface ReadyCheckProps {
  players: Player[]
  currentPlayerId: string
  onToggleReady: () => void
}

export default function ReadyCheck({ players, currentPlayerId, onToggleReady }: ReadyCheckProps) {
  const currentPlayer = players.find(player => player.id === currentPlayerId)
  const allReady = players.every(player => player.isReady)

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <p className="section-kicker">Ready Check</p>
        <h3 className="text-2xl font-semibold text-white">Spieler-Status</h3>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {players.map(player => (
          <div
            key={player.id}
            className={`rounded-[1.25rem] border p-4 transition ${
              player.isReady
                ? 'bg-white/[0.08] border-white/22'
                : 'bg-white/[0.03] border-white/10'
            }`}
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="font-semibold text-white">{player.nickname}</div>
                <div className="text-xs text-zinc-500 font-mono-ui uppercase tracking-[0.12em]">
                  {player.isReady ? 'Bereit' : 'Wartet'}
                </div>
              </div>
              {player.id === currentPlayerId && (
                <div className="status-chip status-chip-live">Du</div>
              )}
            </div>
          </div>
        ))}
      </div>

      {currentPlayer?.id === currentPlayerId && (
        <button
          onClick={onToggleReady}
          className={`w-full px-6 py-4 text-sm ${
            currentPlayer?.isReady ? 'action-danger' : 'action-primary'
          }`}
        >
          {currentPlayer?.isReady ? 'Nicht bereit' : 'Bereit'}
        </button>
      )}

      {allReady && players.length > 0 && (
        <div className="alert-surface rounded-2xl px-4 py-3 text-center text-sm text-zinc-300">
          Alle bereit. Runde startet bald...
        </div>
      )}
    </div>
  )
}
