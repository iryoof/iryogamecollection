import express, { Express, NextFunction, Request, Response } from 'express'
import { createServer } from 'http'
import { Server as SocketIOServer } from 'socket.io'
import cors from 'cors'
import { GameManager } from './game/GameManager'
import { setupSocketHandlers } from './io'
import { setupWerBinIchSocketHandlers } from './werbinich'
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

// Socket.io Events
setupSocketHandlers(io, gameManager)
setupWerBinIchSocketHandlers(io)

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

