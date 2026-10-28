// Ende-zu-Ende-Prüfung von "TikTacToe Ultimate" über echte Sockets.
//
// Die Regeln selbst prüft check-ultimate.mjs ohne Netz. Hier geht es um das,
// was dort nicht vorkommt: Lobby anlegen, beitreten, Plätze verteilen,
// Moduswechsel, der Gleichschritt über zwei Bretter und der Reconnect.
//
// Das Skript startet den Server selbst auf Port 3101 und beendet ihn wieder.
import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'
import { io } from 'socket.io-client'

const PORT = 3101
const BASE_URL = `http://localhost:${PORT}`

let failures = 0

function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) failures += 1
  const suffix = ok ? '' : ` (erwartet ${JSON.stringify(expected)})`
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${label}: ${JSON.stringify(actual)}${suffix}`)
}

function emit(socket, event, ...args) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout bei ${event}`)), 10_000)
    socket.emit(event, ...args, response => {
      clearTimeout(timer)
      resolve(response ?? {})
    })
  })
}

function connect() {
  return new Promise((resolve, reject) => {
    const socket = io(BASE_URL, { transports: ['websocket'], reconnection: false })
    const timer = setTimeout(() => reject(new Error('Verbindung kam nicht zustande')), 10_000)
    socket.on('connect', () => {
      clearTimeout(timer)
      resolve(socket)
    })
    socket.on('connect_error', error => {
      clearTimeout(timer)
      reject(error)
    })
  })
}

// Jeder Client merkt sich den zuletzt empfangenen Zustand.
function track(client) {
  client.socket.on('ttt:state', state => { client.state = state })
  return client
}

async function waitForHealth() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(`${BASE_URL}/health`)
      if (response.ok) return true
    } catch {
      // Server noch nicht oben.
    }
    await sleep(500)
  }
  return false
}

// detached: true gibt dem Server eine eigene Prozessgruppe. Ohne das wird beim
// Aufräumen nur der npx-Wrapper beendet, der eigentliche Node-Prozess läuft
// weiter und blockiert Port 3101 beim nächsten Lauf mit EADDRINUSE.
const server = spawn('npx', ['tsx', 'src/server.ts'], {
  cwd: new URL('../backend/', import.meta.url).pathname,
  env: { ...process.env, PORT: String(PORT) },
  stdio: ['ignore', 'pipe', 'pipe'],
  detached: true
})

const serverLog = []
server.stdout.on('data', chunk => serverLog.push(chunk.toString()))
server.stderr.on('data', chunk => serverLog.push(chunk.toString()))

const clients = []

function killTree(signal) {
  try {
    process.kill(-server.pid, signal)
  } catch {
    // Gruppe schon weg.
  }
}

async function shutdown(code) {
  clients.forEach(client => client.socket?.close())
  killTree('SIGTERM')
  await sleep(400)
  killTree('SIGKILL')
  process.exit(code)
}

try {
  if (!await waitForHealth()) {
    console.log('FAIL Server ist nicht hochgekommen.')
    console.log(serverLog.join(''))
    await shutdown(1)
  }
  console.log('Server läuft auf Port', PORT)
  console.log('\n--- Tisch aufmachen und besetzen ---')

  const names = ['Anna', 'Ben', 'Cem', 'Dana']
  for (const name of names) {
    clients.push(track({ name, socket: await connect(), state: null }))
  }
  const [A, B, C, D] = clients

  const created = await emit(A.socket, 'ttt:lobby:create', A.name)
  check('Tisch angelegt', created.ok, true)
  const code = created.code
  A.session = created.session
  check('Code hat sechs Zeichen', typeof code === 'string' && code.length, 6)
  check('Reconnect-Schlüssel kommt nur im Ack', typeof created.session?.reconnectKey, 'string')

  for (const client of [B, C, D]) {
    const joined = await emit(client.socket, 'ttt:lobby:join', code, client.name)
    check(`${client.name} beigetreten`, joined.ok, true)
    client.session = joined.session
  }
  await sleep(200)

  check('Standardmodus ist 1v1', A.state?.mode, '1v1')
  check('Im 1v1 sitzen nur zwei, der Rest schaut zu', A.state?.seats, [A.session.playerId, B.session.playerId])

  // Der Zustand, den alle bekommen, darf keine Reconnect-Schlüssel enthalten.
  const leaked = JSON.stringify(A.state).includes(B.session.reconnectKey)
  check('Fremder Reconnect-Schlüssel nicht im Broadcast', leaked, false)

  const switched = await emit(A.socket, 'ttt:lobby:mode', '2v2')
  check('Moduswechsel angenommen', switched.ok, true)
  await sleep(200)

  check('Modus ist jetzt 2v2', A.state?.mode, '2v2')
  check('Zuschauer sind nachgerutscht', A.state?.seats, [
    A.session.playerId, B.session.playerId, C.session.playerId, D.session.playerId
  ])

  const notHost = await emit(B.socket, 'ttt:lobby:mode', '1v1')
  check('Nur der Gastgeber darf den Modus wechseln', notHost.error, 'Nur der Host kann den Modus wechseln.')

  console.log('\n--- Partie starten und Gleichschritt prüfen ---')

  const started = await emit(A.socket, 'ttt:lobby:start')
  check('Partie gestartet', started.ok, true)
  await sleep(200)

  check('Zwei Gitter im Spiel', A.state?.match?.boards.length, 2)
  check('Runde 0', A.state?.match?.round, 0)
  check('Anna links, Ben rechts', A.state?.match?.pending, [
    { board: 0, team: 'X', seat: 0 },
    { board: 1, team: 'X', seat: 1 }
  ])

  const wrongSeat = await emit(B.socket, 'ttt:move', 0, 0, 0)
  check('Ben darf nicht am linken Gitter setzen', wrongSeat.error, 'Du bist hier gerade nicht an der Reihe.')

  check('Anna setzt links', (await emit(A.socket, 'ttt:move', 0, 4, 4)).ok, true)
  await sleep(120)
  check('Links wartet auf Cem', A.state?.match?.pending.find(entry => entry.board === 0), { board: 0, team: 'O', seat: 2 })
  check('Runde steht noch', A.state?.match?.round, 0)

  check('Ben setzt rechts', (await emit(B.socket, 'ttt:move', 1, 0, 0)).ok, true)
  await sleep(120)

  const forcedLeft = A.state?.match?.boards[0].forcedSub
  check('Annas Zelle 4 gibt Feld 4 vor', forcedLeft, 4)

  const wrongSub = await emit(C.socket, 'ttt:move', 0, 2, 0)
  check('Falsches Feld abgewiesen', wrongSub.error, 'Du musst in das vorgegebene Feld setzen.')

  check('Cem setzt links', (await emit(C.socket, 'ttt:move', 0, 4, 0)).ok, true)
  await sleep(120)
  check('Runde wartet noch auf rechts', A.state?.match?.round, 0)

  check('Dana setzt rechts', (await emit(D.socket, 'ttt:move', 1, 0, 1)).ok, true)
  await sleep(150)

  check('Runde 1 erreicht', A.state?.match?.round, 1)
  check('Seiten getauscht: Ben links, Anna rechts', A.state?.match?.pending, [
    { board: 0, team: 'X', seat: 1 },
    { board: 1, team: 'X', seat: 0 }
  ])

  const annaWrongBoard = await emit(A.socket, 'ttt:move', 0, 4, 1)
  check('Anna sitzt nach dem Tausch nicht mehr links', annaWrongBoard.error, 'Du bist hier gerade nicht an der Reihe.')

  check('Erlaubte Züge kommen vom Server mit', Array.isArray(A.state?.match?.legal[0]), true)

  console.log('\n--- Reconnect ---')

  const benKey = B.session.reconnectKey
  B.socket.close()
  await sleep(300)

  const benBack = track({ name: 'Ben', socket: await connect(), state: null })
  clients.push(benBack)
  const resumed = await emit(benBack.socket, 'ttt:session:resume', benKey, code)
  check('Ben ist wieder da', resumed.ok, true)
  check('Ben behält seinen Platz', resumed.session?.playerId, B.session.playerId)
  await sleep(200)
  check('Ben ist links weiterhin am Zug', benBack.state?.match?.pending[0], { board: 0, team: 'X', seat: 1 })
  check('Ben gilt wieder als verbunden', benBack.state?.players.find(p => p.id === B.session.playerId)?.isDisconnected, false)

  const badKey = await emit(benBack.socket, 'ttt:session:resume', 'gibt-es-nicht', code)
  check('Unbekannter Schlüssel wird abgelehnt', badKey.error, 'Reconnect-Fenster abgelaufen oder Session ungültig.')

  console.log('\n--- Tisch auflösen ---')

  const closedSeen = new Promise(resolve => C.socket.once('ttt:lobby:closed', () => resolve(true)))
  check('Tisch aufgelöst', (await emit(A.socket, 'ttt:lobby:close')).ok, true)
  check('Alle werden benachrichtigt', await Promise.race([closedSeen, sleep(2000).then(() => false)]), true)
} catch (error) {
  failures += 1
  console.log('FAIL Unerwarteter Fehler:', error.message)
  console.log(serverLog.join(''))
}

if (failures > 0) {
  console.log(`\n${failures} Prüfung(en) fehlgeschlagen.`)
  await shutdown(1)
}
console.log('\nAlle Prüfungen bestanden.')
await shutdown(0)
