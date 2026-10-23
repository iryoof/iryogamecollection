import express, { Express, NextFunction, Request, Response } from 'express'
import { createServer } from 'http'
import { Server as SocketIOServer } from 'socket.io'
import cors from 'cors'
import { GameManager } from './game/GameManager'
import { setupSocketHandlers } from './io'
import { setupWerBinIchSocketHandlers } from './werbinich'
import { setupWavelengthSocketHandlers } from './wavelength'
import { listSaves, saveGame, loadSave, deleteSave } from './saveManager'
import dotenv from 'dotenv'

dotenv.config()

const app: Express = express()
const port = process.env.PORT || 3000

// FRONTEND_URL may hold several comma-separated origins so that the deployed
// site and a local dev server can talk to the same backend. Entries are
// normalised to their origin, because a value that accidentally carries a path
// (e.g. https://iryoof.github.io/iryogamecollection) would never match the
// Origin header a browser sends.
const toOrigin = (value: string): string | null => {
  const trimmed = value.trim()
  if (!trimmed) return null
  try {
    return new URL(trimmed).origin
  } catch {
    return trimmed.replace(/\/+$/, '')
  }
}

// The deployed site and the local dev server are always allowed. They are
// baked in rather than left to FRONTEND_URL so that a missing or misconfigured
// environment variable cannot take the live site offline. FRONTEND_URL only
// adds further origins on top.
const DEFAULT_ALLOWED_ORIGINS = [
  'https://iryoof.github.io', // GitHub Pages
  'http://localhost:5173'     // Vite dev server
]

const allowedOrigins = Array.from(new Set([
  ...DEFAULT_ALLOWED_ORIGINS,
  ...(process.env.FRONTEND_URL || '')
    .split(',')
    .map(toOrigin)
    .filter((value): value is string => value !== null)
]))

// Requests without an Origin header (health checks, curl, same-origin server
// calls) are not subject to CORS, so they must not be rejected here.
//
// Unknown origins are answered with `false`, not with an Error: an Error turns
// into a 500 and also aborts the Socket.IO handshake. Answering `false` just
// omits the Access-Control-Allow-Origin header and lets the browser enforce
// the policy, which is how this endpoint behaved before the allowlist existed.
const corsOrigin = (
  origin: string | undefined,
  callback: (err: Error | null, allow?: boolean) => void
) => {
  callback(null, !origin || allowedOrigins.includes(origin))
}

console.log('Allowed origins:', allowedOrigins.join(', '))

// Middleware
app.use(cors({
  origin: corsOrigin,
  credentials: true,
  methods: ['GET', 'POST']
}))
app.use(express.json())

// HTTP Server
const httpServer = createServer(app)

// Socket.io Server
const io = new SocketIOServer(httpServer, {
  cors: {
    origin: corsOrigin,
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
setupWavelengthSocketHandlers(io)

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

// Alle Lobbys liegen im Arbeitsspeicher dieses Prozesses. Stirbt er, verlieren
// *alle* laufenden Runden ihren Spielstand und sehen "Lobby not found" — ein
// einzelner unbehandelter Fehler in einem Timer oder einer async-Funktion
// reicht dafuer, weil Node seit Version 15 bei unbehandelten Promise-Ablehnungen
// beendet. Deshalb wird hier laut geloggt und weitergelaufen: ein womoeglich
// inkonsistenter Einzelfall ist erheblich weniger schlimm als der Totalverlust
// aller Lobbys.
process.on('unhandledRejection', (reason) => {
  console.error('Unbehandelte Promise-Ablehnung (Prozess laeuft weiter):', reason)
})

process.on('uncaughtException', (error) => {
  console.error('Unbehandelte Ausnahme (Prozess laeuft weiter):', error)
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

