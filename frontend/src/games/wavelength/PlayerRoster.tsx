import type { WavelengthPlayer } from './types'
import { VoteKickButton } from '../../components/VoteKickPanel'
import type { VoteKickApi } from '../../hooks/useVoteKick'

interface PlayerRosterProps {
  players: WavelengthPlayer[]
  selfPlayerId: string | null
  voteKick: VoteKickApi
  /** Marks the seeker where a round is running. */
  seekerId?: string | null
  /** Marks who already voted; only passed on the voting screen. */
  votedPlayerIds?: string[]
  title?: string
}

/**
 * Player list with the per-player "Kick-Vote" button. Shared by the Wavelength
 * game, voting and result screens so that a vote can be started from wherever
 * the lobby happens to be, not just from the waiting room.
 */
export default function PlayerRoster({
  players,
  selfPlayerId,
  voteKick,
  seekerId,
  votedPlayerIds,
  title = 'Am Tisch'
}: PlayerRosterProps) {
  if (!players.length) return null

  return (
    <div className="surface-panel rounded-[1.5rem] p-5 space-y-3">
      <p className="section-kicker">{title}</p>
      <div className="grid grid-cols-1 gap-2">
        {players.map(player => (
          <div
            key={player.id}
            className="surface-panel-strong rounded-[1.25rem] px-4 py-3 flex items-center justify-between gap-3 text-sm"
          >
            <span className="truncate font-semibold text-zinc-100">
              {player.name}
              {player.id === selfPlayerId && (
                <span className="status-chip status-chip-muted ml-2">Du</span>
              )}
              {seekerId && player.id === seekerId && (
                <span className="status-chip status-chip-muted ml-2">Seeker</span>
              )}
            </span>
            <div className="flex items-center gap-2">
              {player.isDisconnected && (
                <span className="status-chip border-yellow-400/30 bg-yellow-400/10 text-yellow-200">
                  Getrennt
                </span>
              )}
              {player.isWaitingForNextRound && (
                <span className="status-chip status-chip-muted">Ab nächster Runde</span>
              )}
              {votedPlayerIds && !player.isWaitingForNextRound && (
                <span
                  className={
                    votedPlayerIds.includes(player.id)
                      ? 'status-chip border-emerald-400/30 bg-emerald-400/10 text-emerald-200'
                      : 'status-chip status-chip-muted'
                  }
                >
                  {votedPlayerIds.includes(player.id) ? 'Gewählt' : 'Wählt noch'}
                </span>
              )}
              {player.id !== selfPlayerId && (
                <VoteKickButton
                  playerName={player.name}
                  onStart={() => voteKick.startVoteKick(player.id)}
                  disabled={!!voteKick.vote}
                />
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
