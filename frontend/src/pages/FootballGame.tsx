import { useEffect, useState } from 'react'
import LanguageSelector from '../components/LanguageSelector'

interface Team {
  id: string
  name: string
  country?: string
}

export default function FootballGame() {
  const [teams, setTeams] = useState<Team[]>([])
  const [home, setHome] = useState<string>('')
  const [away, setAway] = useState<string>('')
  const [result, setResult] = useState<any>(null)
  const [saves, setSaves] = useState<Array<any>>([])
  const [saveName, setSaveName] = useState<string>('My Career')
  const [careerId, setCareerId] = useState<string | null>(null)
  const [careerState, setCareerState] = useState<any>(null)
  const [market, setMarket] = useState<any[]>([])
  const [homePlayers, setHomePlayers] = useState<any[]>([])

  const getTeamName = (id: string) => teams.find(t => t.id === id)?.name || id
  useEffect(() => {
    document.title = 'Football Career'
    const base = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000'
    fetch(`${base}/api/football/teams`).then(r => r.json()).then(setTeams).catch(console.error)
    fetch(`${base}/api/football/saves`).then(r => r.json()).then(setSaves).catch(() => setSaves([]))
  }, [])

  useEffect(() => {
    if (!home) return setHomePlayers([])
    const base = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000'
    fetch(`${base}/api/football/teams/${home}/players`).then(r => r.json()).then(setHomePlayers).catch(() => setHomePlayers([]))
    // refresh market when changing team
    refreshMarket()
  }, [home])

  const simulate = async () => {
    const base = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000'
    if (!home || !away) return
    const res = await fetch(`${base}/api/football/simulate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ homeId: home, awayId: away })
    })
    const data = await res.json()
    setResult(data)
  }

  const refreshSaves = async () => {
    const base = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000'
    try {
      const res = await fetch(`${base}/api/football/saves`)
      const list = await res.json()
      setSaves(list)
    } catch (e) {
      setSaves([])
    }
  }

  const handleSave = async () => {
    const base = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000'
    const payload = { home, away, result }
    const res = await fetch(`${base}/api/football/saves`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: saveName, data: payload })
    })
    const meta = await res.json()
    await refreshSaves()
    return meta
  }

  const handleLoad = async (id: string) => {
    const base = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000'
    const res = await fetch(`${base}/api/football/saves/${id}`)
    if (!res.ok) return
    const payload = await res.json()
    const saved = payload.data
    setHome(saved.home)
    setAway(saved.away)
    setResult(saved.result)
  }

  const handleDelete = async (id: string) => {
    const base = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000'
    await fetch(`${base}/api/football/saves/${id}`, { method: 'DELETE' })
    await refreshSaves()
  }

  const createCareer = async () => {
    const base = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000'
    const res = await fetch(`${base}/api/football/career`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ teamId: home }) })
    const career = await res.json()
    setCareerId(career.id)
    setCareerState(career)
  }

  const loadCareer = async (id: string) => {
    const base = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000'
    const res = await fetch(`${base}/api/football/career/${id}`)
    if (!res.ok) return
    const career = await res.json()
    setCareerId(career.id)
    setCareerState(career)
  }

  const refreshMarket = async () => {
    if (!home) return
    const base = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000'
    const res = await fetch(`${base}/api/football/market/${home}`)
    if (!res.ok) return setMarket([])
    const list = await res.json()
    setMarket(list)
  }

  const careerTeamStanding = careerState?.standings.find((s: any) => s.teamId === careerState.teamId) || null
  const careerPosition = careerTeamStanding ? careerState.standings.indexOf(careerTeamStanding) + 1 : null
  const matchesRemaining = careerState ? careerState.fixtures.length - careerState.currentMatchday : null
  const seasonProgress = careerState ? Math.round((careerState.currentMatchday / careerState.fixtures.length) * 100) : 0

  const handleTransfer = async (playerId: string) => {
    const base = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000'
    const res = await fetch(`${base}/api/football/transfer`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ teamId: home, playerId }) })
    const result = await res.json()
    if (result.success) {
      alert(`Transfer successful: ${result.player.name}`)
      await refreshMarket()
      if (careerId) await loadCareer(careerId)
    } else {
      alert('Transfer failed')
    }
  }

  const handleTrain = async (playerId: string, intensity: 'light' | 'intense' = 'light') => {
    const base = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000'
    const res = await fetch(`${base}/api/football/train`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ teamId: home, playerId, intensity }) })
    const player = await res.json()
    alert(`${player.name} trained — new rating: ${player.rating}`)
    if (careerId) await loadCareer(careerId)
    await refreshMarket()
  }

  const simulateNext = async () => {
    if (!careerId) return
    const base = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000'
    await fetch(`${base}/api/football/career/${careerId}/next`, { method: 'POST' })
    const ref = await fetch(`${base}/api/football/career/${careerId}`)
    const career = await ref.json()
    setCareerState(career)
  }

  const simulateSeason = async () => {
    if (!careerId) return
    const base = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000'
    const res = await fetch(`${base}/api/football/career/${careerId}/simulate`, { method: 'POST' })
    const career = await res.json()
    setCareerState(career)
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-8">
      <div className="max-w-3xl w-full p-8 screen-shell space-y-6">
        <div className="flex flex-col gap-4">
          <div>
            <h1 className="hero-title">Football Career (MVP)</h1>
            <p className="text-white/70 mt-3 max-w-2xl">Starte ein realistisches Singleplayer-Fußball-Abenteuer mit echter Team- und Spielerstruktur. Wähle dein Heimteam, simuliere Matches und verwalte dein Kader, Trainings- und Transferbudget.</p>
          </div>
          <div className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-xl shadow-black/10">
            <div className="flex items-center gap-3 mb-4">
              <div className="rounded-2xl bg-emerald-500/20 text-emerald-300 px-3 py-2">🚀</div>
              <div>
                <p className="font-semibold">Quick Start</p>
                <p className="text-sm text-white/60">In drei Schritten zum ersten Match und zur Karriere.</p>
              </div>
            </div>
            <ol className="space-y-3 text-sm text-white/70">
              <li><span className="font-semibold">1.</span> Wähle dein Team unter Heimmannschaft.</li>
              <li><span className="font-semibold">2.</span> Simuliere ein einzelnes Match oder erstelle eine Karriere.</li>
              <li><span className="font-semibold">3.</span> Trainiere Spieler und kaufe Talente vom Transfermarkt.</li>
            </ol>
          </div>
          <div className="rounded-3xl border border-white/10 bg-slate-950/80 p-6">
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-3">
                <div className="rounded-2xl bg-slate-800/70 p-3 text-xl">ℹ️</div>
                <div>
                  <p className="font-semibold">Schnelle Hilfe</p>
                  <p className="text-sm text-white/60">Nutze diese Tipps, um schneller in die Karriere einzusteigen.</p>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
                <div className="rounded-2xl bg-white/5 border border-white/10 p-4">
                  <p className="font-semibold text-emerald-300">Team</p>
                  <p className="text-white/60 mt-2">Suche ein Team mit ausgewogenem Kader und starte die Saison stabil.</p>
                </div>
                <div className="rounded-2xl bg-white/5 border border-white/10 p-4">
                  <p className="font-semibold text-sky-300">Training</p>
                  <p className="text-white/60 mt-2">Trainiere regelmäßig, um Ratings zu steigern und Matchperformance zu verbessern.</p>
                </div>
                <div className="rounded-2xl bg-white/5 border border-white/10 p-4">
                  <p className="font-semibold text-amber-300">Transfers</p>
                  <p className="text-white/60 mt-2">Kaufe gezielt Talente für schwächere Positionen und baue dein Team aus.</p>
                </div>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="surface-panel rounded-3xl p-6 bg-white/5 border border-white/10">
              <p className="section-kicker">Heimmannschaft</p>
              <select className="w-full p-3 rounded-xl bg-slate-950/60 border border-white/10" value={home} onChange={e => setHome(e.target.value)}>
                <option value="">-- wählen --</option>
                {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <div className="surface-panel rounded-3xl p-6 bg-white/5 border border-white/10">
              <p className="section-kicker">Auswärts</p>
              <select className="w-full p-3 rounded-xl bg-slate-950/60 border border-white/10" value={away} onChange={e => setAway(e.target.value)}>
                <option value="">-- wählen --</option>
                {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
          </div>

          <div className="surface-panel rounded-3xl p-6 bg-white/5 border border-white/10">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="section-kicker">Quick Match</p>
                <p className="text-sm text-white/60">Simuliere ein Einzelspiel ohne Karriere.</p>
              </div>
              <button className="action-primary px-6 py-3" onClick={simulate} disabled={!home || !away || home === away}>Simulate Match</button>
            </div>
            {home && away && home === away && (
              <p className="mt-3 text-sm text-amber-300">Heim- und Auswärtsteam müssen unterschiedlich sein.</p>
            )}
          </div>
        </div>

        {result && (
          <div className="surface-panel rounded-lg p-4">
            <h3 className="text-xl font-semibold">Result</h3>
            <p className="mt-2">{result.home.name} {result.home.goals} - {result.away.goals} {result.away.name}</p>
            <div className="mt-3">
              <h4 className="font-medium">Events</h4>
              <ul className="list-disc ml-5 mt-2 space-y-1">
                {result.events.map((ev: any, idx: number) => (
                  <li key={idx}>[{ev.minute}'] {ev.text}</li>
                ))}
              </ul>
            </div>
          </div>
        )}

        <div className="surface-panel rounded-lg p-4">
          <h3 className="text-xl font-semibold">Career</h3>
          {careerState && (
            <div className="mt-4 rounded-3xl bg-white/5 border border-white/10 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm text-white/60">Season progress</div>
                  <div className="mt-2 text-lg font-semibold">{seasonProgress}% completed</div>
                </div>
                <div className="text-right text-sm text-white/60">{careerState.currentMatchday}/{careerState.fixtures.length} matchdays</div>
              </div>
              <div className="mt-4 h-3 rounded-full bg-white/10 overflow-hidden">
                <div className="h-full rounded-full bg-emerald-400" style={{ width: `${seasonProgress}%` }} />
              </div>
            </div>
          )}
          {careerState && (
            <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="rounded-2xl bg-white/5 border border-white/10 p-4">
                <div className="text-sm text-white/60">Team</div>
                <div className="mt-2 font-semibold">{getTeamName(careerState.teamId)}</div>
              </div>
              <div className="rounded-2xl bg-white/5 border border-white/10 p-4">
                <div className="text-sm text-white/60">League Rank</div>
                <div className="mt-2 font-semibold">{careerPosition ?? '-'} / {careerState.standings.length}</div>
              </div>
              <div className="rounded-2xl bg-white/5 border border-white/10 p-4">
                <div className="text-sm text-white/60">Remaining Matchdays</div>
                <div className="mt-2 font-semibold">{matchesRemaining}</div>
              </div>
            </div>
          )}
          <div className="mt-3 grid grid-cols-1 md:grid-cols-4 gap-2">
            <button className="action-primary px-3 py-2" onClick={createCareer} disabled={!home}>Create Career</button>
            <button className="action-secondary px-3 py-2" onClick={() => loadCareer(careerId || '')} disabled={!careerId}>Refresh Career</button>
            <button className="action-primary px-3 py-2" onClick={simulateNext} disabled={!careerId}>Next Matchday</button>
            <button className="action-primary px-3 py-2" onClick={simulateSeason} disabled={!careerId}>Simulate Full Season</button>
          </div>

          {careerState && (
            <div className="mt-4">
              <div className="font-medium">Season {careerState.season} — Matchday {careerState.currentMatchday}/{careerState.fixtures.length}</div>
              <div className="mt-2">
                <h4 className="font-medium">Next Fixtures</h4>
                <ul className="list-disc ml-5 mt-2">
                  {careerState.fixtures[careerState.currentMatchday] && careerState.fixtures[careerState.currentMatchday].map((f: any, idx: number) => (
                    <li key={idx}>{getTeamName(f.homeId)} vs {getTeamName(f.awayId)} {f.played ? `- ${f.result.homeGoals}:${f.result.awayGoals}` : ''}</li>
                  ))}
                </ul>
              </div>

              <div className="mt-3">
                <h4 className="font-medium">Standings</h4>
                <ol className="mt-2">
                  {careerState.standings.map((s: any, idx: number) => (
                    <li key={idx}>{getTeamName(s.teamId)} — {s.points} pts ({s.played} P, {s.won}-{s.drawn}-{s.lost})</li>
                  ))}
                </ol>
              </div>
            </div>
          )}
        </div>

        <div className="surface-panel rounded-lg p-4">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h3 className="text-xl font-semibold">Squad</h3>
              <p className="text-sm text-white/60">{home ? getTeamName(home) : 'Wähle ein Team aus'} • {homePlayers.length} Spieler</p>
            </div>
            <button className="action-secondary px-3 py-2" onClick={refreshMarket} disabled={!home}>Refresh Market</button>
          </div>

          <div className="mt-3">
            <h4 className="font-medium">Players</h4>
            <ul className="mt-2 space-y-2">
              {homePlayers.map((p: any) => (
                <li key={p.id} className="flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <div className="font-semibold">{p.name}</div>
                    <div className="text-sm text-white/60">Rating {p.rating}</div>
                  </div>
                  <div className="flex gap-2">
                    <button className="action-secondary px-3 py-1" onClick={() => handleTrain(p.id, 'light')}>Train</button>
                    <button className="action-primary px-3 py-1" onClick={() => handleTrain(p.id, 'intense')}>Intense</button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="surface-panel rounded-lg p-4">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h3 className="text-xl font-semibold">Transfer Market</h3>
              <p className="text-sm text-white/60">Players available for your squad.</p>
            </div>
            <button className="action-primary px-3 py-2" onClick={refreshMarket} disabled={!home}>Refresh Market</button>
          </div>

          <div className="mt-3">
            <ul className="mt-3 space-y-2">
              {market.length === 0 ? (
                <li className="text-white/60">Markt leeren oder Heimmannschaft wählen.</li>
              ) : market.map(m => (
                <li key={m.id} className="flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <div className="font-semibold">{m.name}</div>
                    <div className="text-sm text-white/60">{m.rating} • {m.teamName}</div>
                  </div>
                  <button className="action-primary px-3 py-1" onClick={() => handleTransfer(m.id)}>Buy</button>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="surface-panel rounded-lg p-4">
          <h3 className="text-xl font-semibold">Saves</h3>
          <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-2">
            <input className="p-2 rounded bg-white/5 col-span-2" value={saveName} onChange={e => setSaveName(e.target.value)} />
            <button className="action-primary px-3 py-2" onClick={handleSave}>Save</button>
          </div>
          <ul className="mt-3 space-y-2">
            {saves.map(s => (
              <li key={s.id} className="flex items-center justify-between">
                <div>
                  <div className="font-medium">{s.name}</div>
                  <div className="text-sm text-white/60">{new Date(s.date).toLocaleString()}</div>
                </div>
                <div className="flex gap-2">
                  <button className="action-secondary px-3 py-1" onClick={() => handleLoad(s.id)}>Load</button>
                  <button className="action-danger px-3 py-1" onClick={() => handleDelete(s.id)}>Delete</button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <LanguageSelector />
    </div>
  )
}

