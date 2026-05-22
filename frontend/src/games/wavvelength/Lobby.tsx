import type { Socket } from 'socket.io-client'
import type { WavvelengthAck, WavvelengthLobbyState } from './types'

interface LobbyProps {
  socket: Socket
  lobby: WavvelengthLobbyState
  selfPlayerId: string | null
  error: string
  onError: (message: string) => void
  onLeave: () => void
}

export default function Lobby({ socket, lobby, selfPlayerId, error, onError, onLeave }: LobbyProps) {
  const me = lobby.players.find(player => player.id === selfPlayerId)
  const isHost = !!me?.isHost
  const canStart = lobby.players.filter(player => !player.isDisconnected).length >= 2

  const handleStart = () => {
    socket.emit('wvl:lobby:start', (response?: WavvelengthAck) => {
      if (response?.error) {
        onError(response.error)
      }
    })
  }

  const handleClose = () => {
    socket.emit('wvl:lobby:close', (response?: WavvelengthAck) => {
      if (response?.error) {
        onError(response.error)
      }
    })
  }

  const handleLeave = () => {
    socket.emit('wvl:lobby:leave', () => {
      onLeave()
    })
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen px-4 py-8">
      <div className="w-full max-w-3xl space-y-6">
        <div className="text-center space-y-3">
          <p className="section-kicker">Wavelength</p>
          <h1 className="hero-title text-[clamp(2.4rem,8vw,4.8rem)] leading-none">Lobby</h1>
        </div>

        <div className="screen-shell rounded-[2rem] p-6 md:p-8 space-y-6">
          <div className="surface-panel rounded-[1.5rem] p-5 text-center space-y-3">
            <p className="section-kicker">Lobby-Code</p>
            <div className="display-code text-4xl text-white">{lobby.code}</div>
            <p className="text-xs text-zinc-500 font-mono-ui uppercase tracking-[0.14em]">
              Teile den Code mit deinen Freunden
            </p>
          </div>

          <div className="surface-panel rounded-[1.5rem] p-5 space-y-4">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <p className="section-kicker">Spieler</p>
                <h3 className="text-2xl font-semibold text-white">{lobby.players.length} dabei</h3>
              </div>
              <span className="status-chip status-chip-muted">
                {canStart ? 'Bereit zum Starten' : 'Mindestens 2 verbundene Spieler'}
              </span>
            </div>

            <div className="grid grid-cols-1 gap-3">
              {lobby.players.map(player => (
                <div
                  key={player.id}
                  className="surface-panel-strong rounded-[1.25rem] px-4 py-4 text-sm"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className={`h-2.5 w-2.5 rounded-full ${player.isDisconnected ? 'bg-yellow-400' : 'bg-emerald-400'}`} />
                      <span className="truncate text-base font-semibold text-zinc-100">{player.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {player.isHost && (
                        <span className="status-chip border-white/18 bg-white/10 text-zinc-100">Host</span>
                      )}
                      {player.isDisconnected && (
                        <span className="status-chip border-yellow-400/30 bg-yellow-400/10 text-yellow-200">Getrennt</span>
                      )}
                      {player.id === selfPlayerId && (
                        <span className="status-chip status-chip-muted">Du</span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {error && <div className="alert-danger rounded-2xl px-4 py-3 text-sm">{error}</div>}

          <div className="space-y-3 pt-2">
            {isHost ? (
              <>
                <button
                  onClick={handleStart}
                  disabled={!canStart}
                  className="action-primary w-full px-6 py-4 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Spiel starten
                </button>
                <button
                  onClick={handleClose}
                  className="action-danger w-full px-6 py-4 text-sm"
                >
                  Lobby schließen
                </button>
              </>
            ) : (
              <button
                onClick={handleLeave}
                className="action-secondary w-full px-6 py-4 text-sm"
              >
                Lobby verlassen
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
