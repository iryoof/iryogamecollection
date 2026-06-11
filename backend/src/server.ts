import express, { Express, NextFunction, Request, Response } from 'express'
import { createServer } from 'http'
import { Server as SocketIOServer } from 'socket.io'
import cors from 'cors'
import { GameManager } from './game/GameManager'
import { setupSocketHandlers } from './io'
import { setupWerBinIchSocketHandlers } from './werbinich'
import { setupWavvelengthSocketHandlers } from './wavvelength'
import { getTeams, getPlayersByTeam, simulateMatch } from './football/dataLoader'
import { listSaves, saveGame, loadSave, deleteSave } from './saveManager'
import { createCareer, getCareer, simulateNextMatchday, simulateFullSeason } from './football/CareerManager'
import { listMarketOptions, attemptTransfer, train } from './football/CareerManager'
import dotenv from 'dotenv'

dotenv.config()

const app: Express = express()
const port = process.env.PORT || 3000
const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173'

// Middleware
app.use(cors({
  origin: frontendUrl,
  credentials: true,
  methods: ['GET', 'POST']
}))
app.use(express.json())

// HTTP Server
const httpServer = createServer(app)

// Socket.io Server
const io = new SocketIOServer(httpServer, {
  cors: {
    origin: frontendUrl,
    credentials: true,
    methods: ['GET', 'POST']
  },
  transports: ['websocket', 'polling']
})

// Game Manager
const gameManager = new GameManager()

// Routes
app.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() })
})

app.get('/api/stats', (req: Request, res: Response) => {
  res.json({
    activeLobbies: gameManager.getActiveLobbyCount(),
    totalGames: gameManager.getTotalGamesPlayed(),
    uptime: process.uptime()
  })
})

// Football singleplayer endpoints (MVP)
app.get('/api/football/teams', (req: Request, res: Response) => {
  try {
    const teams = getTeams().map(t => ({ id: t.id, name: t.name, country: t.country }))
    res.json(teams)
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

app.get('/api/football/teams/:id/players', (req: Request, res: Response) => {
  try {
    const id = req.params.id
    const players = getPlayersByTeam(id)
    res.json(players)
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

app.post('/api/football/simulate', (req: Request, res: Response) => {
  try {
    const { homeId, awayId } = req.body
    if (!homeId || !awayId) return res.status(400).json({ error: 'homeId and awayId required' })
    const result = simulateMatch(homeId, awayId)
    res.json(result)
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// Career endpoints
app.post('/api/football/career', (req: Request, res: Response) => {
  try {
    const { teamId, leagueTeamIds } = req.body
    if (!teamId) return res.status(400).json({ error: 'teamId required' })
    const career = createCareer(teamId, leagueTeamIds)
    res.json(career)
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

app.get('/api/football/career/:id', (req: Request, res: Response) => {
  try {
    const id = req.params.id
    const career = getCareer(id)
    if (!career) return res.status(404).json({ error: 'Career not found' })
    res.json(career)
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

app.post('/api/football/career/:id/next', (req: Request, res: Response) => {
  try {
    const id = req.params.id
    const result = simulateNextMatchday(id)
    res.json(result)
  } catch (err: any) {
    res.status(400).json({ error: err.message })
  }
})

app.post('/api/football/career/:id/simulate', (req: Request, res: Response) => {
  try {
    const id = req.params.id
    const career = simulateFullSeason(id)
    res.json(career)
  } catch (err: any) {
    res.status(400).json({ error: err.message })
  }
})

// Transfer market
app.get('/api/football/market/:teamId', (req: Request, res: Response) => {
  try {
    const teamId = req.params.teamId
    const list = listMarketOptions(teamId)
    res.json(list)
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

app.post('/api/football/transfer', (req: Request, res: Response) => {
  try {
    const { teamId, playerId } = req.body
    if (!teamId || !playerId) return res.status(400).json({ error: 'teamId and playerId required' })
    const result = attemptTransfer(teamId, playerId)
    res.json(result)
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

app.post('/api/football/train', (req: Request, res: Response) => {
  try {
    const { teamId, playerId, intensity } = req.body
    if (!teamId || !playerId) return res.status(400).json({ error: 'teamId and playerId required' })
    const player = train(teamId, playerId, intensity)
    res.json(player)
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// Save / Load careers (simple filesystem persistence)
app.get('/api/football/saves', (req: Request, res: Response) => {
  try {
    const saves = listSaves()
    res.json(saves)
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

app.post('/api/football/saves', (req: Request, res: Response) => {
  try {
    const { name, data } = req.body
    if (!name || data === undefined) return res.status(400).json({ error: 'name and data required' })
    const meta = saveGame(name, data)
    res.json(meta)
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

app.get('/api/football/saves/:id', (req: Request, res: Response) => {
  try {
    const id = req.params.id
    const payload = loadSave(id)
    res.json(payload)
  } catch (err: any) {
    res.status(404).json({ error: err.message })
  }
})

app.delete('/api/football/saves/:id', (req: Request, res: Response) => {
  try {
    const id = req.params.id
    deleteSave(id)
    res.json({ ok: true })
  } catch (err: any) {
    res.status(404).json({ error: err.message })
  }
})

// Socket.io Events
setupSocketHandlers(io, gameManager)
setupWerBinIchSocketHandlers(io)
setupWavvelengthSocketHandlers(io)

// Error handling â€” must be the last middleware. Express only treats this as
// an error handler when the function has exactly 4 parameters; with 3, it is
// registered as regular middleware and crashes every request because `res` is
// then the next() function, not the response object.
app.use((err: any, req: Request, res: Response, _next: NextFunction) => {
  console.error('âŒ Error:', err)
  res.status(500).json({ error: 'Internal Server Error' })
})

// Start Server
httpServer.listen(port, () => {
  console.log('ðŸš€ Server running on http://localhost:' + port)
  console.log('ðŸ“¡ WebSocket ready for connections')
})

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server')
  httpServer.close(() => {
    console.log('HTTP server closed')
    process.exit(0)
  })
})

export { app, io, gameManager }

