import type { Socket } from 'socket.io-client'
import Board from './Board'
import Masthead from './Masthead'
import {
  SEAT_LABELS,
  boardName,
  seatCountOf,
  teamOfSeat,
  type Mark,
  type UltimateAck,
  type UltimateMatchView,
  type UltimateState
} from './types'

interface GameProps {
  socket: Socket
  state: UltimateState
  match: UltimateMatchView
  selfPlayerId: string | null
  error: string
  onError: (message: string) => void
}

export default function Game({ socket, state, match, selfPlayerId, error, onError }: GameProps) {
  const isHost = selfPlayerId !== null && state.hostId === selfPlayerId
  const mySeat = state.players.find(player => player.id === selfPlayerId)?.seat ?? null
  const myPending = match.pending.filter(entry => entry.seat === mySeat)

  const ack = (response?: UltimateAck) => {
    if (response?.error) onError(response.error)
  }

  const nameAtSeat = (seat: number): string => {
    const playerId = state.seats[seat] ?? null
    return state.players.find(player => player.id === playerId)?.name ?? '—'
  }

  const teamMembers = (team: Mark): string =>
    Array.from({ length: seatCountOf(state.mode) }, (_, seat) => seat)
      .filter(seat => teamOfSeat(state.mode, seat) === team)
      .map(seat => `${SEAT_LABELS[seat]} ${nameAtSeat(seat)}`)
      .join(' · ')

  const boardNote = (index: number): string => {
    const board = match.boards[index]
    if (board.result === 'X' || board.result === 'O') return `entschieden für ${board.result}`
    if (board.result === 'draw') return 'unentschieden'

    const turn = match.pending.find(entry => entry.board === index)
    if (!turn) return 'Runde hier gespielt'
    return `${turn.team} · ${nameAtSeat(turn.seat)}`
  }

  const headline = (): string => {
    if (match.finished) {
      if (match.winner === 'draw') return 'Unentschieden'
      return `Mannschaft ${match.winner} gewinnt`
    }
    if (mySeat === null) return 'Du siehst zu'
    if (myPending.length === 0) return 'Nicht am Zug'
    if (state.mode === '1v1') return 'Du bist am Zug'
    return `Du bist am Zug · ${myPending.map(entry => boardName(state.mode, entry.board)).join(' und ')}`
  }

  const waitingOn = (): string =>
    match.pending
      .filter(entry => entry.seat !== mySeat)
      .map(entry => nameAtSeat(entry.seat))
      .join(', ')

  const play = (board: number, sub: number, cell: number) => {
    socket.emit('ttt:move', board, sub, cell, ack)
  }

  return (
    <div className="zt-page">
      <div className="zt-sheet">
        <Masthead
          left="Iryo Game Collection"
          right={`Tisch ${state.code} · Runde ${match.round + 1}`}
          title="TikTacToe Ultimate"
          subtitle={state.mode === '2v2' ? 'Zu viert an zwei Gittern' : 'Zu zweit an einem Gitter'}
        />

        <div className="mt-5 mb-5">
          <div className="zt-banner">{headline()}</div>
          {!match.finished && waitingOn() && (
            <p className="zt-kicker" style={{ marginTop: '0.5rem' }}>
              Es fehlt noch: {waitingOn()}
            </p>
          )}
        </div>

        <section className="mb-6">
          <table className="zt-table">
            <thead>
              <tr>
                <th>Mannschaft</th>
                <th>Aufstellung</th>
                <th>Punkte</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={{ fontFamily: 'var(--zt-hard)', fontWeight: 700 }}>X</td>
                <td>{teamMembers('X')}</td>
                <td style={{ fontSize: '1.1rem' }}>{match.score.X}</td>
              </tr>
              <tr>
                <td style={{ fontFamily: 'var(--zt-hard)', fontWeight: 700 }}>O</td>
                <td>{teamMembers('O')}</td>
                <td style={{ fontSize: '1.1rem' }}>{match.score.O}</td>
              </tr>
            </tbody>
          </table>
          <p className="zt-kicker" style={{ marginTop: '0.4rem' }}>
            Gewonnenes Feld 1 Punkt · gewonnenes Gitter 3 Punkte · volles Feld ohne Sieger 0
          </p>
        </section>

        <div className={match.boards.length > 1 ? 'zt-boards zt-boards--two' : 'zt-boards'}>
          {match.boards.map((board, index) => (
            <Board
              key={index}
              board={board}
              legal={match.legal[index] ?? []}
              canPlay={myPending.some(entry => entry.board === index)}
              onPlay={(sub, cell) => play(index, sub, cell)}
              label={boardName(state.mode, index)}
              note={boardNote(index)}
            />
          ))}
        </div>

        {error && (
          <>
            <hr className="zt-rule" />
            <p className="zt-note">{error}</p>
          </>
        )}

        <hr className="zt-rule" />

        {match.finished ? (
          <div className="grid gap-2 sm:grid-cols-2">
            {isHost ? (
              <>
                <button className="zt-btn zt-btn--solid" onClick={() => socket.emit('ttt:play-again', ack)}>
                  Noch eine Partie
                </button>
                <button className="zt-btn" onClick={() => socket.emit('ttt:lobby:back', ack)}>
                  Zurück an den Tisch
                </button>
              </>
            ) : (
              <p className="zt-note">Der Gastgeber entscheidet, wie es weitergeht.</p>
            )}
          </div>
        ) : (
          <p className="zt-kicker">
            Das umrandete Feld gibt vor, wo gesetzt werden muss. Ist es schon entschieden, darf frei gewählt werden.
          </p>
        )}
      </div>
    </div>
  )
}
