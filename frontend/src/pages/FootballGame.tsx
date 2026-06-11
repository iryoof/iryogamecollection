import { useEffect, useState } from 'react'
import LanguageSelector from '../components/LanguageSelector'

type Player = {
  id: string
  name: string
  rating: number
  teamId: string
}

type Team = {
  id: string
  name: string
  country?: string
  players: Player[]
}

type Fixture = {
  homeId: string
  awayId: string
  played?: boolean
  result?: { homeGoals: number; awayGoals: number; events: any[] }
}

type Standing = {
  teamId: string
  played: number
  won: number
  drawn: number
  lost: number
  goalsFor: number
  goalsAgainst: number
  points: number
}

type CareerState = {
  id: string
  teamId: string
  season: number
  fixtures: Fixture[][]
  currentMatchday: number
  standings: Standing[]
}

const LOCAL_SAVE_KEY = 'football-career-saves'

const localTeams: Team[] = [
  {
    id: 'manu',
    name: 'Manchester United',
    country: 'England',
    players: [
      { id: 'rm', name: 'Marcus Rashford', rating: 85, teamId: 'manu' },
      { id: 'br', name: 'Bruno Fernandes', rating: 88, teamId: 'manu' },
      { id: 'cr', name: 'Casemiro', rating: 86, teamId: 'manu' },
      { id: 'mg', name: 'Luke Shaw', rating: 80, teamId: 'manu' },
      { id: 'vh', name: 'Raphaël Varane', rating: 83, teamId: 'manu' },
      { id: 'dh', name: 'Diogo Dalot', rating: 77, teamId: 'manu' }
    ]
  },
  {
    id: 'realm',
    name: 'Real Madrid',
    country: 'Spain',
    players: [
      { id: 'vr', name: 'Vinícius Júnior', rating: 91, teamId: 'realm' },
      { id: 'kb', name: 'Karim Benzema', rating: 89, teamId: 'realm' },
      { id: 'lm', name: 'Luka Modrić', rating: 86, teamId: 'realm' },
      { id: 'tb', name: 'Toni Kroos', rating: 88, teamId: 'realm' },
      { id: 'rd', name: 'Rodrygo', rating: 84, teamId: 'realm' },
      { id: 'js', name: 'Jude Bellingham', rating: 92, teamId: 'realm' }
    ]
  },
  {
    id: 'bayern',
    name: 'Bayern München',
    country: 'Germany',
    players: [
      { id: 'lm1', name: 'Leroy Sané', rating: 88, teamId: 'bayern' },
      { id: 'ml', name: 'Manuel Neuer', rating: 88, teamId: 'bayern' },
      { id: 'jk', name: 'Joshua Kimmich', rating: 89, teamId: 'bayern' },
      { id: 'sb', name: 'Serge Gnabry', rating: 84, teamId: 'bayern' },
      { id: 'kn', name: 'Kingsley Coman', rating: 85, teamId: 'bayern' }
    ]
  },
  {
    id: 'dortmund',
    name: 'Borussia Dortmund',
    country: 'Germany',
    players: [
      { id: 'hm', name: 'Erling Haaland', rating: 92, teamId: 'dortmund' },
      { id: 'jm', name: 'Jude Bellingham', rating: 90, teamId: 'dortmund' },
      { id: 'bf', name: 'Marco Reus', rating: 86, teamId: 'dortmund' },
      { id: 'kg2', name: 'Karim Adeyemi', rating: 82, teamId: 'dortmund' },
      { id: 'gm', name: 'Gianluigi Donnarumma', rating: 88, teamId: 'dortmund' }
    ]
  },
  {
    id: 'lev',
    name: 'Bayer Leverkusen',
    country: 'Germany',
    players: [
      { id: 'fc', name: 'Florian Wirtz', rating: 86, teamId: 'lev' },
      { id: 'pd', name: 'Patrik Schick', rating: 84, teamId: 'lev' },
      { id: 'ea2', name: 'Exequiel Palacios', rating: 82, teamId: 'lev' },
      { id: 'al', name: 'Alphonso Davies', rating: 86, teamId: 'lev' },
      { id: 'ke', name: 'Kevin Trapp', rating: 83, teamId: 'lev' }
    ]
  },
  {
    id: 'hamburg',
    name: 'Hamburger SV',
    country: 'Germany',
    players: [
      { id: 'je', name: 'Jackson Irvine', rating: 77, teamId: 'hamburg' },
      { id: 'lk', name: 'Leroy Kwadwo', rating: 74, teamId: 'hamburg' },
      { id: 'sr', name: 'Sebastian Schonlau', rating: 77, teamId: 'hamburg' },
      { id: 'fe', name: 'Filip Bilbija', rating: 73, teamId: 'hamburg' },
      { id: 'mh', name: 'Mats Vester', rating: 75, teamId: 'hamburg' }
    ]
  },
  {
    id: 'schalke',
    name: 'Schalke 04',
    country: 'Germany',
    players: [
      { id: 'fr', name: 'Franco Di Santo', rating: 75, teamId: 'schalke' },
      { id: 'ml2', name: 'Matthias Duhamel', rating: 74, teamId: 'schalke' },
      { id: 'am2', name: 'Amine Harit', rating: 76, teamId: 'schalke' },
      { id: 'gn', name: 'Goncalo Paciencia', rating: 73, teamId: 'schalke' },
      { id: 'sp', name: 'Sepp van den Berg', rating: 72, teamId: 'schalke' }
    ]
  },
  {
    id: 'munich1860',
    name: '1860 München',
    country: 'Germany',
    players: [
      { id: 'ks', name: 'Kevin Stadler', rating: 72, teamId: 'munich1860' },
      { id: 'mt', name: 'Maximilian Wittek', rating: 73, teamId: 'munich1860' },
      { id: 'jh', name: 'Jonas Hummels', rating: 71, teamId: 'munich1860' },
      { id: 'br2', name: 'Birk Risa', rating: 70, teamId: 'munich1860' },
      { id: 'jm2', name: 'Jan Mauersberger', rating: 70, teamId: 'munich1860' }
    ]
  },
  {
    id: 'barca',
    name: 'Barcelona',
    country: 'Spain',
    players: [
      { id: 'lm2', name: 'Lionel Messi', rating: 93, teamId: 'barca' },
      { id: 'rfl', name: 'Robert Lewandowski', rating: 91, teamId: 'barca' },
      { id: 'fb', name: 'Frenkie de Jong', rating: 88, teamId: 'barca' },
      { id: 'ab', name: 'Ansu Fati', rating: 84, teamId: 'barca' },
      { id: 'mg2', name: 'Marc-André ter Stegen', rating: 88, teamId: 'barca' }
    ]
  },
  {
    id: 'atm',
    name: 'Atlético Madrid',
    country: 'Spain',
    players: [
      { id: 'km', name: 'Koke', rating: 84, teamId: 'atm' },
      { id: 'js2', name: 'João Félix', rating: 84, teamId: 'atm' },
      { id: 'yb', name: 'Yannick Carrasco', rating: 83, teamId: 'atm' },
      { id: 'rg', name: 'Rodrigo De Paul', rating: 85, teamId: 'atm' },
      { id: 'mg3', name: 'Jan Oblak', rating: 91, teamId: 'atm' }
    ]
  },
  {
    id: 'juve',
    name: 'Juventus',
    country: 'Italy',
    players: [
      { id: 'cr2', name: 'Cristiano Ronaldo', rating: 91, teamId: 'juve' },
      { id: 'pm', name: 'Paulo Dybala', rating: 86, teamId: 'juve' },
      { id: 'lm3', name: 'Leonardo Bonucci', rating: 85, teamId: 'juve' },
      { id: 'mr', name: 'Matthijs de Ligt', rating: 86, teamId: 'juve' },
      { id: 'wm', name: 'Wojciech Szczęsny', rating: 88, teamId: 'juve' }
    ]
  },
  {
    id: 'milan',
    name: 'AC Milan',
    country: 'Italy',
    players: [
      { id: 'zz', name: 'Zlatan Ibrahimović', rating: 88, teamId: 'milan' },
      { id: 'ks2', name: 'Krzysztof Piątek', rating: 82, teamId: 'milan' },
      { id: 'ra', name: 'Rafael Leão', rating: 85, teamId: 'milan' },
      { id: 'tm', name: 'Theo Hernández', rating: 86, teamId: 'milan' },
      { id: 'gs', name: 'Gianluigi Donnarumma', rating: 88, teamId: 'milan' }
    ]
  },
  {
    id: 'psg',
    name: 'Paris Saint-Germain',
    country: 'France',
    players: [
      { id: 'km3', name: 'Kylian Mbappé', rating: 92, teamId: 'psg' },
      { id: 'ne', name: 'Neymar Jr.', rating: 91, teamId: 'psg' },
      { id: 'mg4', name: 'Marco Verratti', rating: 87, teamId: 'psg' },
      { id: 'ml4', name: 'Marquinhos', rating: 87, teamId: 'psg' },
      { id: 'hg', name: 'Hugo Lloris', rating: 87, teamId: 'psg' }
    ]
  },
  {
    id: 'ajax',
    name: 'Ajax',
    country: 'Netherlands',
    players: [
      { id: 'bf2', name: 'Brian Brobbey', rating: 82, teamId: 'ajax' },
      { id: 'rh', name: 'Ryan Gravenberch', rating: 84, teamId: 'ajax' },
      { id: 'jn', name: 'Jurriën Timber', rating: 84, teamId: 'ajax' },
      { id: 'ks3', name: 'Kjell Scherpen', rating: 78, teamId: 'ajax' },
      { id: 'ez', name: 'Edson Álvarez', rating: 83, teamId: 'ajax' }
    ]
  },
  {
    id: 'fener',
    name: 'Fenerbahçe',
    country: 'Turkey',
    players: [
      { id: 'mb', name: 'Mesut Özil', rating: 80, teamId: 'fener' },
      { id: 'yq', name: 'Youssef En-Nesyri', rating: 82, teamId: 'fener' },
      { id: 'tt', name: 'Tolga Ciğerci', rating: 77, teamId: 'fener' },
      { id: 'cb', name: 'Calhanoglu', rating: 84, teamId: 'fener' },
      { id: 'bm', name: 'Berke Özer', rating: 75, teamId: 'fener' }
    ]
  },
  {
    id: 'city',
    name: 'Manchester City',
    country: 'England',
    players: [
      { id: 'kp', name: 'Kevin De Bruyne', rating: 91, teamId: 'city' },
      { id: 'rs', name: 'Riyad Mahrez', rating: 86, teamId: 'city' },
      { id: 'er', name: 'Erling Haaland', rating: 92, teamId: 'city' },
      { id: 'rs2', name: 'Ruben Dias', rating: 87, teamId: 'city' },
      { id: 'ed', name: 'Ederson', rating: 89, teamId: 'city' }
    ]
  },
  {
    id: 'arsenal',
    name: 'Arsenal',
    country: 'England',
    players: [
      { id: 'ag', name: 'Bukayo Saka', rating: 87, teamId: 'arsenal' },
      { id: 'os', name: 'Olivier Giroud', rating: 83, teamId: 'arsenal' },
      { id: 'gm2', name: 'Gabriel Magalhães', rating: 84, teamId: 'arsenal' },
      { id: 'bd', name: 'Ben White', rating: 82, teamId: 'arsenal' },
      { id: 'jm3', name: 'James Maddison', rating: 85, teamId: 'arsenal' }
    ]
  },
  {
    id: 'leeds',
    name: 'Leeds United',
    country: 'England',
    players: [
      { id: 'rz', name: 'Rodrigo', rating: 84, teamId: 'leeds' },
      { id: 'pj', name: 'Pascal Groß', rating: 80, teamId: 'leeds' },
      { id: 'le', name: 'Liam Cooper', rating: 77, teamId: 'leeds' },
      { id: 'bm2', name: 'Brenden Aaronson', rating: 79, teamId: 'leeds' },
      { id: 'dg', name: 'Daniel James', rating: 78, teamId: 'leeds' }
    ]
  },
  {
    id: 'portsmouth',
    name: 'Portsmouth',
    country: 'England',
    players: [
      { id: 'ms', name: 'Marcus Harness', rating: 76, teamId: 'portsmouth' },
      { id: 'rb', name: 'Ryan Bennett', rating: 75, teamId: 'portsmouth' },
      { id: 'hp', name: 'Harrison Pink', rating: 74, teamId: 'portsmouth' },
      { id: 'jc', name: 'Jonson Clarke-Harris', rating: 79, teamId: 'portsmouth' },
      { id: 'jm4', name: 'John Mousinho', rating: 73, teamId: 'portsmouth' }
    ]
  },
  {
    id: 'exeter',
    name: 'Exeter City',
    country: 'England',
    players: [
      { id: 'sc', name: 'Sam Nombe', rating: 74, teamId: 'exeter' },
      { id: 'na', name: 'Nathan Baxter', rating: 73, teamId: 'exeter' },
      { id: 'tg', name: 'Tommy Gregory', rating: 72, teamId: 'exeter' },
      { id: 'lb', name: 'Lee Martin', rating: 71, teamId: 'exeter' },
      { id: 'ms2', name: 'Matt Jay', rating: 73, teamId: 'exeter' }
    ]
  }
]

function getTeamById(teams: Team[], id: string) {
  return teams.find(t => t.id === id) || null
}

function getTeamName(teams: Team[], id: string) {
  return getTeamById(teams, id)?.name || id
}

function getAllPlayers(teams: Team[]) {
  return teams.flatMap(team => team.players.map(player => ({ ...player, teamId: team.id })))
}

function computeTeamRating(teams: Team[], id: string) {
  const team = getTeamById(teams, id)
  if (!team) return 0
  const sum = team.players.reduce((total, player) => total + player.rating, 0)
  return Math.round(sum / Math.max(team.players.length, 1))
}

function randomInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function simulateLocalMatch(teams: Team[], homeId: string, awayId: string) {
  const homeRating = computeTeamRating(teams, homeId)
  const awayRating = computeTeamRating(teams, awayId)
  const baseHome = Math.max(0, Math.round(1.5 + (homeRating - awayRating) * 0.06 + randomInt(-1, 1)))
  const baseAway = Math.max(0, Math.round(1.2 + (awayRating - homeRating) * 0.05 + randomInt(-1, 1)))
  const homeGoals = Math.min(5, baseHome + randomInt(0, 2))
  const awayGoals = Math.min(5, baseAway + randomInt(0, 2))
  const events = [
    { minute: randomInt(10, 35), text: `${getTeamName(teams, homeId)} scores first!` },
    { minute: randomInt(36, 70), text: `${getTeamName(teams, awayId)} pushes for a reply.` },
    { minute: randomInt(71, 90), text: `${homeGoals > awayGoals ? getTeamName(teams, homeId) : getTeamName(teams, awayId)} finishes the match strong.` }
  ]

  return {
    home: { id: homeId, name: getTeamName(teams, homeId), goals: homeGoals },
    away: { id: awayId, name: getTeamName(teams, awayId), goals: awayGoals },
    events
  }
}

function buildStandings(teamIds: string[]) {
  return teamIds.map(id => ({ teamId: id, played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, points: 0 }))
}

function createRoundRobin(teams: string[]) {
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
    t.splice(1, 0, t.pop() as string)
    rounds.push(fixtures)
  }
  return rounds
}

function createLocalCareer(teamId: string) {
  const teamIds = localTeams.map(t => t.id)
  const fixtures = createRoundRobin(teamIds)
  return {
    id: `${Date.now()}-${teamId}`,
    teamId,
    season: 1,
    fixtures,
    currentMatchday: 0,
    standings: buildStandings(teamIds)
  } as CareerState
}

function simulateNextMatchdayLocal(career: CareerState, teams: Team[]) {
  if (career.currentMatchday >= career.fixtures.length) throw new Error('Season complete')
  const matchday = career.fixtures[career.currentMatchday]
  for (const fixture of matchday) {
    const res = simulateLocalMatch(teams, fixture.homeId, fixture.awayId)
    fixture.played = true
    fixture.result = { homeGoals: res.home.goals, awayGoals: res.away.goals, events: res.events }
    const homeS = career.standings.find(s => s.teamId === fixture.homeId)!
    const awayS = career.standings.find(s => s.teamId === fixture.awayId)!
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
  career.standings.sort((a, b) => b.points - a.points || (b.goalsFor - b.goalsAgainst) - (a.goalsFor - a.goalsAgainst))
  return career
}

function listMarketOptionsLocal(teams: Team[], teamId: string) {
  return getAllPlayers(teams).filter(player => player.teamId !== teamId)
}

function transferPlayerLocal(teams: Team[], teamId: string, playerId: string): { success: boolean; player?: Player; teams?: Team[] } {
  const sourceTeam = teams.find(team => team.players.some(player => player.id === playerId))
  const targetTeam = teams.find(team => team.id === teamId)
  if (!sourceTeam || !targetTeam || sourceTeam.id === targetTeam.id) return { success: false }
  const player = sourceTeam.players.find(p => p.id === playerId)
  if (!player) return { success: false }
  const updatedTeams = teams.map(team => {
    if (team.id === sourceTeam.id) return { ...team, players: team.players.filter(p => p.id !== playerId) }
    if (team.id === targetTeam.id) return { ...team, players: [...team.players, { ...player, teamId }] }
    return team
  })
  return { success: true, player: { ...player, teamId }, teams: updatedTeams }
}

function trainPlayerLocal(teams: Team[], playerId: string, intensity: 'light' | 'intense') {
  return teams.map(team => ({
    ...team,
    players: team.players.map(player => {
      if (player.id !== playerId) return player
      const bump = intensity === 'intense' ? 2 : 1
      return { ...player, rating: Math.min(99, player.rating + bump) }
    })
  }))
}

function loadLocalSaves() {
  const raw = window.localStorage.getItem(LOCAL_SAVE_KEY)
  if (!raw) return []
  try {
    return JSON.parse(raw)
  } catch {
    return []
  }
}

function saveLocalSave(name: string, data: any) {
  const saves = loadLocalSaves()
  const newSave = { id: `${Date.now()}`, name, date: new Date().toISOString(), data }
  window.localStorage.setItem(LOCAL_SAVE_KEY, JSON.stringify([newSave, ...saves]))
  return newSave
}

function deleteLocalSave(id: string) {
  const saves = loadLocalSaves().filter((save: any) => save.id !== id)
  window.localStorage.setItem(LOCAL_SAVE_KEY, JSON.stringify(saves))
}

const LOCAL_CAREER_STATE_KEY = 'football-career-state'

function saveLocalCareerState(state: CareerState) {
  window.localStorage.setItem(LOCAL_CAREER_STATE_KEY, JSON.stringify(state))
}

function loadLocalCareerState(id: string) {
  const raw = window.localStorage.getItem(LOCAL_CAREER_STATE_KEY)
  if (!raw) return null
  try {
    const career = JSON.parse(raw) as CareerState
    return career.id === id ? career : null
  } catch {
    return null
  }
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
    setTeams(localTeams)
    setSaves(loadLocalSaves())
  }, [])

  useEffect(() => {
    if (!home) {
      setHomePlayers([])
      setMarket([])
      return
    }
    const team = getTeamById(teams, home)
    setHomePlayers(team?.players || [])
    refreshMarket()
  }, [home, teams])

  const simulate = async () => {
    if (!home || !away) return
    const data = simulateLocalMatch(teams, home, away)
    setResult(data)
  }

  const refreshSaves = async () => {
    setSaves(loadLocalSaves())
  }

  const handleSave = async () => {
    const payload = { home, away, result }
    const meta = saveLocalSave(saveName, payload)
    await refreshSaves()
    return meta
  }

  const handleLoad = async (id: string) => {
    const payload = loadLocalSaves().find((save: any) => save.id === id)
    if (!payload) return
    setHome(payload.data.home)
    setAway(payload.data.away)
    setResult(payload.data.result)
  }

  const handleDelete = async (id: string) => {
    deleteLocalSave(id)
    await refreshSaves()
  }

  const createCareer = async () => {
    if (!home) return
    const career = createLocalCareer(home)
    setCareerId(career.id)
    setCareerState(career)
    saveLocalCareerState(career)
  }

  const loadCareer = async (id: string) => {
    if (!id) return
    const career = loadLocalCareerState(id)
    if (!career) return
    setCareerId(career.id)
    setCareerState(career)
  }

  const refreshMarket = async () => {
    if (!home) return setMarket([])
    setMarket(listMarketOptionsLocal(teams, home))
  }

  const careerTeamStanding = careerState?.standings.find((s: any) => s.teamId === careerState.teamId) || null
  const careerPosition = careerTeamStanding ? careerState.standings.indexOf(careerTeamStanding) + 1 : null
  const matchesRemaining = careerState ? careerState.fixtures.length - careerState.currentMatchday : null
  const seasonProgress = careerState ? Math.round((careerState.currentMatchday / careerState.fixtures.length) * 100) : 0

  const handleTransfer = async (playerId: string) => {
    if (!home) return
    const result = transferPlayerLocal(teams, home, playerId)
    if (result.success && result.teams && result.player) {
      setTeams(result.teams)
      setMarket(listMarketOptionsLocal(result.teams, home))
      alert(`Transfer successful: ${result.player.name}`)
      if (careerState) saveLocalCareerState(careerState)
    } else {
      alert('Transfer failed')
    }
  }

  const handleTrain = async (playerId: string, intensity: 'light' | 'intense' = 'light') => {
    const updated = trainPlayerLocal(teams, playerId, intensity)
    setTeams(updated)
    const player = updated.flatMap(t => t.players).find(p => p.id === playerId)
    if (player) alert(`${player.name} trained — new rating: ${player.rating}`)
    if (careerState) saveLocalCareerState(careerState)
    await refreshMarket()
  }

  const simulateNext = async () => {
    if (!careerState) return
    const updatedCareer = simulateNextMatchdayLocal({ ...careerState }, teams)
    setCareerState({ ...updatedCareer })
    saveLocalCareerState(updatedCareer)
  }

  const simulateSeason = async () => {
    if (!careerState) return
    let updatedCareer = { ...careerState }
    while (updatedCareer.currentMatchday < updatedCareer.fixtures.length) {
      updatedCareer = simulateNextMatchdayLocal(updatedCareer, teams)
    }
    setCareerState({ ...updatedCareer })
    saveLocalCareerState(updatedCareer)
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

