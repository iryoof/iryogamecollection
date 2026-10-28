import type { Socket } from 'socket.io-client'
import Masthead from './Masthead'
import {
  SEAT_LABELS,
  seatCountOf,
  teamOfSeat,
  type MatchMode,
  type UltimateAck,
  type UltimateState
} from './types'

interface LobbyProps {
  socket: Socket
  state: UltimateState
  selfPlayerId: string | null
  error: string
  onError: (message: string) => void
  onLeave: () => void
}

export default function Lobby({ socket, state, selfPlayerId, error, onError, onLeave }: LobbyProps) {
  const isHost = selfPlayerId !== null && state.hostId === selfPlayerId
  const seats = seatCountOf(state.mode)
  const mySeat = state.players.find(player => player.id === selfPlayerId)?.seat ?? null
  const allSeatsTaken = state.seats.slice(0, seats).every(id => id !== null)

  const ack = (response?: UltimateAck) => {
    if (response?.error) onError(response.error)
  }

  const nameOf = (playerId: string | null) =>
    state.players.find(player => player.id === playerId)?.name ?? null

  const setMode = (mode: MatchMode) => socket.emit('ttt:lobby:mode', mode, ack)
  const takeSeat = (seat: number | null) => socket.emit('ttt:lobby:seat', seat, ack)

  const spectators = state.players.filter(player => player.seat === null)

  return (
    <div className="zt-page">
      <div className="zt-sheet">
        <Masthead
          left="Iryo Game Collection"
          right={`Tisch ${state.code}`}
          title="TikTacToe Ultimate"
          subtitle="Am Tisch · es wird noch gewartet"
        />

        <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr] mt-6">
          <section className="space-y-4">
            <div className="zt-box-head">
              <p className="zt-kicker">Sitzordnung</p>
              <h2 className="zt-heading">Wer sitzt wo</h2>
            </div>

            <table className="zt-table">
              <thead>
                <tr>
                  <th>Platz</th>
                  <th>Zeichen</th>
                  {state.mode === '2v2' && <th>Beginnt</th>}
                  <th>Person</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: seats }, (_, seat) => {
                  const occupantId = state.seats[seat] ?? null
                  const occupant = nameOf(occupantId)
                  const mine = mySeat === seat

                  return (
                    <tr key={seat}>
                      <td>{SEAT_LABELS[seat]}</td>
                      <td>{teamOfSeat(state.mode, seat)}</td>
                      {state.mode === '2v2' && <td>{seat % 2 === 0 ? 'links' : 'rechts'}</td>}
                      <td>{occupant ?? <span style={{ color: 'var(--zt-ink-faint)' }}>frei</span>}</td>
                      <td>
                        {mine ? (
                          <button className="zt-btn zt-btn--inline" onClick={() => takeSeat(null)}>
                            aufstehen
                          </button>
                        ) : occupantId === null ? (
                          <button className="zt-btn zt-btn--inline" onClick={() => takeSeat(seat)}>
                            hinsetzen
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>

            {state.mode === '2v2' && (
              <p className="zt-note">
                A und B sind eine Mannschaft und spielen X, C und D spielen O.
                Partner sitzen nie am selben Gitter — nach jedem Zugpaar wird
                die Seite getauscht.
              </p>
            )}
          </section>

          <section className="space-y-4">
            <div className="zt-box-head">
              <p className="zt-kicker">Spielart</p>
              <h2 className="zt-heading">{state.mode === '2v2' ? 'Zu viert, zwei Gitter' : 'Zu zweit, ein Gitter'}</h2>
            </div>

            {isHost ? (
              <div className="grid grid-cols-2 gap-2">
                <button
                  className={state.mode === '1v1' ? 'zt-btn zt-btn--solid' : 'zt-btn'}
                  onClick={() => setMode('1v1')}
                >
                  1 gegen 1
                </button>
                <button
                  className={state.mode === '2v2' ? 'zt-btn zt-btn--solid' : 'zt-btn'}
                  onClick={() => setMode('2v2')}
                >
                  2 gegen 2
                </button>
              </div>
            ) : (
              <p className="zt-note">Die Spielart bestimmt der Gastgeber.</p>
            )}

            <hr className="zt-rule-hair" />

            <div>
              <p className="zt-kicker">Tischnummer</p>
              <p style={{ fontFamily: 'var(--zt-mono)', fontSize: '1.7rem', letterSpacing: '0.3em', margin: '0.2rem 0' }}>
                {state.code}
              </p>
              <p className="zt-kicker">Zum Mitspielen weitergeben</p>
            </div>

            {spectators.length > 0 && (
              <>
                <hr className="zt-rule-hair" />
                <p className="zt-kicker">Sieht zu</p>
                <p style={{ fontSize: '0.9rem' }}>
                  {spectators.map(player => player.name).join(', ')}
                </p>
              </>
            )}
          </section>
        </div>

        {error && (
          <>
            <hr className="zt-rule" />
            <p className="zt-note">{error}</p>
          </>
        )}

        <hr className="zt-rule" />

        <div className="grid gap-2 sm:grid-cols-3">
          {isHost && (
            <button
              className="zt-btn zt-btn--solid"
              disabled={!allSeatsTaken}
              onClick={() => socket.emit('ttt:lobby:start', ack)}
            >
              {allSeatsTaken ? 'Partie beginnen' : 'Es fehlt noch jemand'}
            </button>
          )}
          {isHost && (
            <button className="zt-btn" onClick={() => socket.emit('ttt:lobby:close', ack)}>
              Tisch auflösen
            </button>
          )}
          <button
            className="zt-btn"
            onClick={() => socket.emit('ttt:lobby:leave', () => onLeave())}
          >
            Tisch verlassen
          </button>
        </div>
      </div>
    </div>
  )
}
