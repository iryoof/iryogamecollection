import { useEffect, useState } from 'react'
import { VoteKickState } from '../../../shared/types'

interface VoteKickPanelProps {
  vote: VoteKickState | null
  selfPlayerId: string | null
  onVote: (approve: boolean) => void
}

/**
 * Shows the open vote kick with its tally and the Ja/Nein buttons. Shared by
 * all three multiplayer games, so it only speaks in terms of the vote state and
 * leaves the socket handling to the page.
 */
export default function VoteKickPanel({ vote, selfPlayerId, onVote }: VoteKickPanelProps) {
  const [secondsLeft, setSecondsLeft] = useState(0)

  useEffect(() => {
    if (!vote) {
      setSecondsLeft(0)
      return
    }

    const tick = () => setSecondsLeft(Math.max(0, Math.ceil((vote.expiresAt - Date.now()) / 1000)))
    tick()
    const handle = window.setInterval(tick, 1000)
    return () => window.clearInterval(handle)
  }, [vote])

  if (!vote) return null

  const isTarget = selfPlayerId === vote.targetId
  const myVote = selfPlayerId && vote.approvedBy.includes(selfPlayerId)
    ? 'yes'
    : selfPlayerId && vote.rejectedBy.includes(selfPlayerId)
      ? 'no'
      : null

  return (
    <div className="alert-warning rounded-2xl px-4 py-4 space-y-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-semibold">
          {isTarget
            ? 'Die Lobby stimmt gerade über deinen Rauswurf ab.'
            : `Abstimmung: ${vote.targetName} aus der Lobby entfernen?`}
        </span>
        <span className="status-chip status-chip-muted">noch {secondsLeft}s</span>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="status-chip status-chip-muted">
          Ja {vote.approvedBy.length} / {vote.needed}
        </span>
        <span className="status-chip status-chip-muted">Nein {vote.rejectedBy.length}</span>
        <span className="opacity-70">
          {vote.eligible} Spieler stimmberechtigt
        </span>
      </div>

      {isTarget ? (
        <p className="opacity-80">Du kannst über deinen eigenen Rauswurf nicht abstimmen.</p>
      ) : (
        <div className="flex items-center gap-2">
          <button
            onClick={() => onVote(true)}
            disabled={myVote === 'yes'}
            className="action-danger px-4 py-2 text-xs disabled:opacity-50"
          >
            {myVote === 'yes' ? 'Ja abgegeben' : 'Ja, entfernen'}
          </button>
          <button
            onClick={() => onVote(false)}
            disabled={myVote === 'no'}
            className="action-secondary px-4 py-2 text-xs disabled:opacity-50"
          >
            {myVote === 'no' ? 'Nein abgegeben' : 'Nein, behalten'}
          </button>
        </div>
      )}
    </div>
  )
}

interface VoteKickButtonProps {
  playerName: string
  onStart: () => void
  disabled?: boolean
}

/** "Kick-Vote" button for a single row in a player list. */
export function VoteKickButton({ playerName, onStart, disabled }: VoteKickButtonProps) {
  const handleClick = () => {
    if (!window.confirm(`Abstimmung starten, um ${playerName} zu entfernen?`)) return
    onStart()
  }

  return (
    <button
      onClick={handleClick}
      disabled={disabled}
      title={`Abstimmung starten, um ${playerName} zu entfernen`}
      className="action-secondary px-3 py-2 text-[11px] disabled:opacity-40"
    >
      Kick-Vote
    </button>
  )
}
