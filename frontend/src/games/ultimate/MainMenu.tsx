import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import type { Socket } from 'socket.io-client'
import Masthead from './Masthead'
import type { UltimateAck, UltimateSession } from './types'

interface MainMenuProps {
  socket: Socket
  onSession: (session: UltimateSession) => void
  error: string
  onError: (message: string) => void
  clearError: () => void
}

const today = () =>
  new Date().toLocaleDateString('de-DE', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric'
  })

export default function MainMenu({ socket, onSession, error, onError, clearError }: MainMenuProps) {
  const { t } = useTranslation()
  const [nickname, setNickname] = useState('')
  const [lobbyCode, setLobbyCode] = useState('')
  const [loading, setLoading] = useState<'create' | 'join' | null>(null)

  const handleAck = (response?: UltimateAck) => {
    setLoading(null)
    if (response?.error) {
      onError(response.error)
      return
    }
    if (response?.session) {
      clearError()
      onSession({ ...response.session, reconnectDeadline: null })
    }
  }

  const handleCreate = () => {
    if (!nickname.trim()) {
      onError(t('pleaseEnterNickname'))
      return
    }
    setLoading('create')
    socket.emit('ttt:lobby:create', nickname.trim(), handleAck)
  }

  const handleJoin = () => {
    if (!nickname.trim()) {
      onError(t('pleaseEnterNickname'))
      return
    }
    if (!lobbyCode.trim()) {
      onError(t('pleaseEnterCode'))
      return
    }
    setLoading('join')
    socket.emit('ttt:lobby:join', lobbyCode.trim().toUpperCase(), nickname.trim(), handleAck)
  }

  return (
    <div className="zt-page">
      <div className="zt-sheet">
        <Masthead
          left="Iryo Game Collection"
          right={today()}
          title="TikTacToe Ultimate"
          subtitle="Die Rätselseite · Ausgabe für zwei bis vier Personen"
        />

        <div className="grid gap-6 md:grid-cols-[1fr_1px_1fr] mt-6">
          <section className="space-y-4">
            <div className="zt-box-head">
              <p className="zt-kicker">Anmeldung</p>
              <h2 className="zt-heading">Name eintragen</h2>
            </div>
            <input
              className="zt-input"
              type="text"
              value={nickname}
              maxLength={20}
              placeholder="z. B. David"
              onChange={event => setNickname(event.target.value.slice(0, 20))}
            />
            <p className="zt-kicker">{nickname.length}/20 Zeichen</p>

            <button
              className="zt-btn zt-btn--solid"
              onClick={handleCreate}
              disabled={loading !== null}
            >
              {loading === 'create' ? 'Tisch wird aufgemacht …' : 'Neuen Tisch aufmachen'}
            </button>
          </section>

          <div className="hidden md:block" style={{ background: 'var(--zt-ink-faint)' }} />

          <section className="space-y-4">
            <div className="zt-box-head">
              <p className="zt-kicker">Beitreten</p>
              <h2 className="zt-heading">An einen Tisch setzen</h2>
            </div>
            <input
              className="zt-input zt-input--code"
              type="text"
              value={lobbyCode}
              maxLength={6}
              placeholder="ABC123"
              onChange={event => setLobbyCode(event.target.value.toUpperCase())}
            />
            <p className="zt-kicker">Sechsstelliger Code vom Gastgeber</p>

            <button
              className="zt-btn"
              onClick={handleJoin}
              disabled={loading !== null}
            >
              {loading === 'join' ? 'Setze mich …' : 'Platz nehmen'}
            </button>
          </section>
        </div>

        {error && (
          <>
            <hr className="zt-rule" />
            <p className="zt-note">{error}</p>
          </>
        )}

        <hr className="zt-rule" />

        <section className="zt-box">
          <div className="zt-box-head">
            <p className="zt-kicker">Spielregeln</p>
            <h2 className="zt-heading">Wie gespielt wird</h2>
          </div>
          <div className="zt-columns">
            <p>
              Ein Gitter besteht aus neun Feldern, und jedes Feld ist selbst ein
              kleines Drei-gewinnt. Wer ein Feld gewinnt, bekommt einen Punkt.
            </p>
            <p>
              Entscheidend ist, <em>wo</em> im Feld gesetzt wird: die Zelle gibt
              vor, in welchem Feld der Gegner als Nächstes setzen muss. Ist
              dieses Feld bereits entschieden, darf frei gewählt werden.
            </p>
            <p>
              Drei eigene Felder in einer Reihe bringen drei Punkte — und
              beenden das Gitter sofort. Die übrigen Felder bleiben dann
              ungespielt und bringen niemandem etwas.
            </p>
            <p>
              Im Spiel zu viert laufen <strong>zwei</strong> Gitter nebeneinander.
              Jede Mannschaft hat an jedem Gitter einen Mann sitzen. Nach jedem
              Zugpaar tauschen die Paare die Seite, sodass beide Partner
              abwechselnd an beiden Gittern spielen.
            </p>
          </div>
        </section>

        <hr className="zt-rule" />

        <Link to="/" className="zt-btn zt-btn--inline">
          {t('backToPortal')}
        </Link>
      </div>
    </div>
  )
}
