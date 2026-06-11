import { simulateMatch, getTeamById, getTeams, getAllPlayers, transferPlayer, trainPlayer } from './dataLoader'
import { randomUUID } from 'crypto'

export interface Fixture {
  homeId: string
  awayId: string
  played?: boolean
  result?: { homeGoals: number; awayGoals: number; events: any[] }
}

export interface CareerState {
  id: string
  teamId: string
  season: number
  fixtures: Fixture[][] // array of matchdays
  currentMatchday: number
  standings: { teamId: string; played: number; won: number; drawn: number; lost: number; goalsFor: number; goalsAgainst: number; points: number }[]
}

const careers: Map<string, CareerState> = new Map()

function createRoundRobin(teams: string[]): Fixture[][] {
  const t = teams.slice()
  if (t.length % 2 === 1) t.push('BYE')
  const n = t.length
  const rounds: Fixture[][] = []
  for (let r = 0; r < n - 1; r++) {
    const fixtures: Fixture[] = []
    for (let i = 0; i < n / 2; i++) {
      const home = t[i]
      const away = t[n - 1 - i]
      if (home !== 'BYE' && away !== 'BYE') fixtures.push({ homeId: home, awayId: away })
    }
    // rotate
    t.splice(1, 0, t.pop() as string)
    rounds.push(fixtures)
  }
  return rounds
}

function buildStandings(teamIds: string[]) {
  return teamIds.map(id => ({ teamId: id, played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, points: 0 }))
}

export function createCareer(teamId: string, leagueTeamIds?: string[]) {
  const teams = leagueTeamIds && leagueTeamIds.length >= 2 ? leagueTeamIds : getTeams().map(t => t.id)
  if (!teams.includes(teamId)) teams.push(teamId)
  const fixtures = createRoundRobin(teams)
  const state: CareerState = {
    id: randomUUID(),
    teamId,
    season: 1,
    fixtures,
    currentMatchday: 0,
    standings: buildStandings(teams)
  }
  careers.set(state.id, state)
  return state
}

export function getCareer(id: string) {
  return careers.get(id) || null
}

export function simulateNextMatchday(id: string) {
  const career = careers.get(id)
  if (!career) throw new Error('Career not found')
  if (career.currentMatchday >= career.fixtures.length) throw new Error('Season complete')

  const matchday = career.fixtures[career.currentMatchday]
  for (const f of matchday) {
    const res = simulateMatch(f.homeId, f.awayId)
    f.played = true
    f.result = { homeGoals: res.home.goals, awayGoals: res.away.goals, events: res.events }

    // update standings
    const homeS = career.standings.find(s => s.teamId === f.homeId)!
    const awayS = career.standings.find(s => s.teamId === f.awayId)!
    homeS.played += 1
    awayS.played += 1
    homeS.goalsFor += res.home.goals
    homeS.goalsAgainst += res.away.goals
    awayS.goalsFor += res.away.goals
    awayS.goalsAgainst += res.home.goals
    if (res.home.goals > res.away.goals) {
      homeS.won += 1; awayS.lost += 1; homeS.points += 3
    } else if (res.home.goals < res.away.goals) {
      awayS.won += 1; homeS.lost += 1; awayS.points += 3
    } else {
      homeS.drawn += 1; awayS.drawn += 1; homeS.points += 1; awayS.points += 1
    }
  }

  career.currentMatchday += 1

  // sort standings
  career.standings.sort((a, b) => b.points - a.points || (b.goalsFor - b.goalsAgainst) - (a.goalsFor - a.goalsAgainst))
  return { matchdayIndex: career.currentMatchday - 1, matchday }
}

export function simulateFullSeason(id: string) {
  const career = careers.get(id)
  if (!career) throw new Error('Career not found')
  while (career.currentMatchday < career.fixtures.length) {
    simulateNextMatchday(id)
  }
  return career
}

export function listMarketOptions(teamId: string) {
  // return players not in team
  const all = getAllPlayers()
  return all.filter(p => p.teamId !== teamId)
}

export function attemptTransfer(teamId: string, playerId: string) {
  // simplistic: always succeed with 70% probability, else fail
  const marketPlayer = getAllPlayers().find(p => p.id === playerId)
  if (!marketPlayer) throw new Error('Player not found')
  const success = Math.random() < 0.7
  if (success) {
    transferPlayer(marketPlayer.teamId, teamId, playerId)
  }
  return { success, player: marketPlayer }
}

export function train(teamId: string, playerId: string, intensity: 'light' | 'intense' = 'light') {
  const p = trainPlayer(teamId, playerId, intensity)
  return p
}
