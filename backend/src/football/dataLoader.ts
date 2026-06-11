import fs from 'fs'
import path from 'path'

export interface FootballPlayer {
  id: string
  name: string
  rating: number
}

export interface FootballTeam {
  id: string
  name: string
  country?: string
  players: FootballPlayer[]
}

let teams: FootballTeam[] | null = null

export function loadSampleData() {
  if (teams) return teams
  const p = path.join(__dirname, '../../data/sample_football.json')
  const raw = fs.readFileSync(p, 'utf-8')
  const obj = JSON.parse(raw)
  teams = obj.teams as FootballTeam[]
  return teams
}

export function getTeams() {
  loadSampleData()
  return teams || []
}

export function getTeamById(id: string) {
  loadSampleData()
  return teams?.find(t => t.id === id) || null
}

export function getPlayersByTeam(id: string) {
  const team = getTeamById(id)
  return team ? team.players : []
}

export function getAllPlayers() {
  loadSampleData()
  return teams ? teams.flatMap(t => t.players.map(p => ({ ...p, teamId: t.id, teamName: t.name }))) : []
}

export function transferPlayer(fromTeamId: string, toTeamId: string, playerId: string) {
  loadSampleData()
  const from = teams?.find(t => t.id === fromTeamId)
  const to = teams?.find(t => t.id === toTeamId)
  if (!from || !to) throw new Error('Team not found')
  const idx = from.players.findIndex(p => p.id === playerId)
  if (idx === -1) throw new Error('Player not found in source team')
  const [player] = from.players.splice(idx, 1)
  to.players.push(player)
  return player
}

export function trainPlayer(teamId: string, playerId: string, intensity: 'light' | 'intense' = 'light') {
  loadSampleData()
  const team = teams?.find(t => t.id === teamId)
  if (!team) throw new Error('Team not found')
  const player = team.players.find(p => p.id === playerId)
  if (!player) throw new Error('Player not found')
  const delta = intensity === 'light' ? Math.random() * 1.5 : Math.random() * 3 + 0.5
  player.rating = Math.min(99, Math.round((player.rating + delta) * 10) / 10)
  return player
}

function poissonSample(lambda: number) {
  // Knuth's algorithm
  let L = Math.exp(-lambda)
  let k = 0
  let p = 1
  do {
    k++
    p *= Math.random()
  } while (p > L)
  return k - 1
}

export function simulateMatch(homeId: string, awayId: string) {
  const home = getTeamById(homeId)
  const away = getTeamById(awayId)
  if (!home || !away) throw new Error('Team not found')

  const avg = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length

  const homeRating = avg(home.players.slice(0, 11).map(p => p.rating))
  const awayRating = avg(away.players.slice(0, 11).map(p => p.rating))

  // expected goals baseline
  const baseline = 1.1
  const diff = (homeRating - awayRating) / 10 // scale
  const lambdaHome = Math.max(0.1, baseline + diff)
  const lambdaAway = Math.max(0.1, baseline - diff)

  const homeGoals = poissonSample(lambdaHome)
  const awayGoals = poissonSample(lambdaAway)

  const events: Array<{ minute: number; text: string }> = []
  // simple event generation
  for (let i = 0; i < homeGoals; i++) {
    events.push({ minute: Math.floor(Math.random() * 90) + 1, text: `${home.players[i % home.players.length].name} scores` })
  }
  for (let i = 0; i < awayGoals; i++) {
    events.push({ minute: Math.floor(Math.random() * 90) + 1, text: `${away.players[i % away.players.length].name} scores` })
  }

  events.sort((a, b) => a.minute - b.minute)

  return {
    home: { id: home.id, name: home.name, goals: homeGoals },
    away: { id: away.id, name: away.name, goals: awayGoals },
    events
  }
}
