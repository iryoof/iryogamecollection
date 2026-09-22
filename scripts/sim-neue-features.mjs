// Simuliert die drei neuen Mehrspieler-Funktionen mit echten Socket-Clients
// gegen ein lokal gestartetes Backend: unbegrenzter Reconnect, Votekick und
// Nachjoinen in laufende Partien.
//
// Warum als Skript und nicht als Unit-Test: alle drei Funktionen leben im
// Zusammenspiel von Lobby-Zustand, Socket-Handlern und Broadcast. Ein Test auf
// die Klassen allein wuerde genau die Stellen verfehlen, an denen es schiefgeht.
//
// Aufruf: node scripts/sim-neue-features.mjs [--schnell]
// --schnell ueberspringt die 65-Sekunden-Wartezeit, mit der bewiesen wird, dass
// im laufenden Spiel wirklich kein Eviction-Timer mehr feuert.
import { spawn } from 'node:child_process'
import process from 'node:process'
import { setTimeout as delay } from 'node:timers/promises'
import { io as createSocket } from 'socket.io-client'

const FAST = process.argv.includes('--schnell')
const CYPHER_GRACE_MS = 60_000

let checks = 0
let failures = 0

function check(label, condition, detail = '') {
  checks += 1
  if (condition) {
    console.log(`  OK   ${label}`)
    return
  }
  failures += 1
  console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`)
}

async function waitFor(predicate, timeoutMs, label) {
  const start = Date.now()
  for (;;) {
    const value = predicate()
    if (value) return value
    if (Date.now() - start >= timeoutMs) throw new Error(`Timeout: ${label}`)
    await delay(40)
  }
}

async function waitForHealth(serverUrl) {
  const start = Date.now()
  while (Date.now() - start < 20000) {
    try {
      const response = await fetch(`${serverUrl}/health`)
      if (response.ok) return
    } catch {
      // Server noch nicht oben
    }
    await delay(100)
  }
  throw new Error('Health-Check wurde nicht bereit')
}

function startBackend() {
  const port = 3200 + Math.floor(Math.random() * 2000)
  const serverUrl = `http://127.0.0.1:${port}`
  const backend = spawn(process.execPath, ['backend/dist/server.js'], {
    cwd: process.cwd(),
    env: { ...process.env, PORT: String(port), FRONTEND_URL: 'http://localhost:5173' },
    stdio: ['ignore', 'pipe', 'pipe']
  })
  let output = ''
  backend.stdout.on('data', chunk => { output += chunk.toString() })
  backend.stderr.on('data', chunk => { output += chunk.toString() })
  return { backend, serverUrl, dumpOutput: () => output }
}

function connect(serverUrl) {
  const socket = createSocket(serverUrl, {
    transports: ['websocket'],
    forceNew: true,
    reconnection: false
  })
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Connect-Timeout')), 8000)
    socket.once('connect', () => { clearTimeout(timer); resolve(socket) })
    socket.once('connect_error', error => { clearTimeout(timer); reject(error) })
  })
}

const ask = (socket, event, ...args) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error(`Ack-Timeout: ${event}`)), 8000)
  socket.emit(event, ...args, response => { clearTimeout(timer); resolve(response || {}) })
})

// ---------------------------------------------------------------- Cypher ----

async function cypherClient(serverUrl, playerId, nickname) {
  const socket = await connect(serverUrl)
  const client = {
    playerId,
    nickname,
    socket,
    state: null,
    rounds: [],
    errors: [],
    kickedReason: null,
    voteKick: null,
    voteKickResults: []
  }
  const setState = state => { client.state = state }
  socket.on('lobby-created', (_code, state) => setState(state))
  socket.on('lobby-joined', setState)
  socket.on('state-update', setState)
  socket.on('round-started', round => client.rounds.push(round))
  socket.on('kicked', reason => { client.kickedReason = reason })
  socket.on('votekick:state', state => { client.voteKick = state })
  socket.on('votekick:result', result => client.voteKickResults.push(result))
  socket.on('error', message => client.errors.push(String(message)))
  return client
}

async function cypherLobby(serverUrl, names) {
  const clients = []
  for (const [index, name] of names.entries()) {
    clients.push(await cypherClient(serverUrl, `p-${name}-${index}-${Date.now()}`, name))
  }
  const host = clients[0]
  host.socket.emit(
    'create-lobby',
    { playerCount: names.length, timerEnabled: false, timerSeconds: 60 },
    host.nickname,
    host.playerId
  )
  const code = await new Promise(resolve => host.socket.once('lobby-created', resolve))

  for (const client of clients.slice(1)) {
    client.socket.emit('join-lobby', code, client.nickname, client.playerId)
    await waitFor(() => client.state, 8000, `${client.nickname} beigetreten`)
  }
  await waitFor(() => host.state?.players.length === clients.length, 8000, 'volle Lobby')
  return { clients, host, code }
}

async function cypherStart(host, clients) {
  host.socket.emit('start-game')
  await Promise.all(clients.map(client =>
    waitFor(() => client.rounds.includes(1), 8000, `${client.nickname} Runde 1`)
  ))
}

async function szenarioReconnectOhneLimit(serverUrl) {
  console.log('\n=== Cypher: Reconnect ohne Zeitlimit ===')
  const { clients, host, code } = await cypherLobby(serverUrl, ['Anna', 'Ben', 'Cem'])
  const dropper = clients[2]

  // Erst im Wartebereich: dort muss die alte Frist weiter gelten.
  dropper.socket.disconnect()
  await waitFor(
    () => host.state?.disconnectedPlayerIds?.includes(dropper.playerId),
    8000,
    'Getrennt im Wartebereich'
  )
  check(
    'Wartebereich: Deadline wird gesetzt',
    typeof host.state.disconnectDeadlines?.[dropper.playerId] === 'number',
    JSON.stringify(host.state.disconnectDeadlines)
  )

  // Zurueckholen und Spiel starten.
  const back = await cypherClient(serverUrl, dropper.playerId, dropper.nickname)
  clients[2] = back
  back.socket.emit('join-lobby', code, back.nickname, back.playerId)
  await waitFor(() => host.state?.disconnectedPlayerIds?.length === 0, 8000, 'wieder verbunden')
  await cypherStart(host, clients)

  // Jetzt im laufenden Spiel: keine Frist mehr.
  back.socket.disconnect()
  await waitFor(
    () => host.state?.disconnectedPlayerIds?.includes(back.playerId),
    8000,
    'Getrennt im Spiel'
  )
  check(
    'Laufendes Spiel: keine Deadline',
    host.state.disconnectDeadlines?.[back.playerId] === undefined,
    JSON.stringify(host.state.disconnectDeadlines)
  )

  if (FAST) {
    console.log(`  (uebersprungen: ${CYPHER_GRACE_MS / 1000 + 5}s Wartezeit auf die ausbleibende Eviction)`)
  } else {
    console.log(`  warte ${CYPHER_GRACE_MS / 1000 + 5}s, um zu sehen ob doch jemand rausfliegt ...`)
    await delay(CYPHER_GRACE_MS + 5000)
    check(
      `Nach ${CYPHER_GRACE_MS / 1000 + 5}s immer noch in der Lobby`,
      host.state.players.some(player => player.id === back.playerId),
      `Spieler: ${host.state.players.map(player => player.nickname).join(', ')}`
    )
  }

  // Und zurueckkommen klappt.
  const returned = await cypherClient(serverUrl, back.playerId, back.nickname)
  clients[2] = returned
  returned.socket.emit('join-lobby', code, returned.nickname, returned.playerId)
  await waitFor(() => host.state?.disconnectedPlayerIds?.length === 0, 8000, 'zurueck im Spiel')
  check('Wiedereinstieg ins laufende Spiel klappt', host.state.players.length === 3)

  clients.forEach(client => client.socket.disconnect())
}

async function szenarioNachjoinenCypher(serverUrl) {
  console.log('\n=== Cypher: Nachjoinen zum Rundenwechsel ===')
  const { clients, host, code } = await cypherLobby(serverUrl, ['Anna', 'Ben', 'Cem'])
  await cypherStart(host, clients)

  const late = await cypherClient(serverUrl, `p-late-${Date.now()}`, 'Dora')
  late.socket.emit('join-lobby', code, late.nickname, late.playerId)
  await waitFor(() => host.state?.pendingPlayers?.length === 1, 8000, 'Nachzuegler auf der Bank')

  check('Nachzuegler steht auf der Bank', host.state.pendingPlayers[0].nickname === 'Dora')
  check('Nachzuegler nicht in der Aufstellung', host.state.players.length === 3)

  late.socket.emit('submit-text', 'zu frueh')
  await waitFor(() => late.errors.length > 0, 8000, 'Fehlermeldung fuer Nachzuegler')
  check(
    'Nachzuegler darf in Runde 1 nicht schreiben',
    late.errors[0].includes('nächsten Runde'),
    late.errors[0]
  )

  // Runde 1 verlangt zwei Zeilen, spaetere Runden genau eine (Lobby.submitText).
  // Eine einzeilige Abgabe muss deutlich abgelehnt werden und darf die Runde
  // nicht blockieren - sonst wartet die halbe Lobby auf jemanden, der glaubt,
  // er haette abgegeben.
  const sloppy = clients[1]
  const errorsBefore = sloppy.errors.length
  sloppy.socket.emit('submit-text', 'nur-eine-zeile')
  await waitFor(() => sloppy.errors.length > errorsBefore, 8000, 'Fehler bei einzeiliger Abgabe')
  check(
    'Einzeilige Abgabe in Runde 1 wird klar abgelehnt',
    sloppy.errors.at(-1).includes('zwei Zeilen'),
    sloppy.errors.at(-1)
  )
  check(
    'Abgelehnte Abgabe zaehlt nicht als abgegeben',
    !host.state.submittedPlayerIds.includes(sloppy.playerId),
    JSON.stringify(host.state.submittedPlayerIds)
  )

  for (const client of clients) {
    client.socket.emit('submit-text', `${client.nickname}-r1a\n${client.nickname}-r1b`)
  }
  await waitFor(() => host.state?.roundComplete, 8000, 'Runde 1 komplett')
  check('Runde 1 wird nach dem Nachbessern fertig', host.state.roundComplete === true)

  host.socket.emit('next-round')
  await waitFor(() => late.rounds.includes(2), 8000, 'Nachzuegler bekommt Runde 2')

  check('Nachzuegler ist ab Runde 2 dabei', host.state.players.length === 4)
  check('Bank ist leer', host.state.pendingPlayers.length === 0)

  for (const client of [...clients, late]) {
    client.socket.emit('submit-text', `${client.nickname}-r2`)
  }
  await waitFor(() => host.state?.submittedPlayerIds?.length === 4, 8000, 'Runde 2 komplett')
  check('Runde 2 wird mit 4 Spielern komplett', host.state.submittedPlayerIds.length === 4)

  for (const client of [...clients, late]) client.socket.disconnect()
}

async function szenarioVotekickCypher(serverUrl) {
  console.log('\n=== Cypher: Votekick ===')
  const { clients, host } = await cypherLobby(serverUrl, ['Anna', 'Ben', 'Cem', 'Dora'])
  const [anna, ben, cem, dora] = clients

  anna.socket.emit('votekick:start', dora.playerId)
  await waitFor(() => ben.voteKick, 8000, 'Abstimmung laeuft')

  check('Ziel ist Dora', ben.voteKick.targetName === 'Dora')
  check('3 Stimmberechtigte (ohne Ziel)', ben.voteKick.eligible === 3, `eligible=${ben.voteKick.eligible}`)
  check('2 Ja noetig', ben.voteKick.needed === 2, `needed=${ben.voteKick.needed}`)
  check('Starter zaehlt als Ja', ben.voteKick.approvedBy.length === 1)

  dora.socket.emit('votekick:vote', false)
  await waitFor(() => dora.errors.length > 0, 8000, 'Ziel wird abgewiesen')
  check('Ziel darf nicht mitstimmen', dora.errors[0].includes('eigenen Rauswurf'), dora.errors[0])

  cem.socket.emit('votekick:vote', true)
  await waitFor(() => dora.kickedReason, 8000, 'Dora fliegt raus')
  check('Zweites Ja kickt', dora.kickedReason.includes('Abstimmung'), dora.kickedReason)
  await waitFor(() => host.state?.players.length === 3, 8000, 'Roster geschrumpft')
  check('Dora ist aus der Aufstellung', !host.state.players.some(player => player.nickname === 'Dora'))
  check('Ergebnis wird gemeldet', ben.voteKickResults.at(-1)?.outcome === 'passed')

  // Zweiter Durchgang: Nein-Mehrheit lehnt ab. Jetzt 3 Spieler, 2 Berechtigte,
  // 2 Ja noetig - ein Nein reicht also zum Scheitern.
  ben.voteKick = null
  anna.socket.emit('votekick:start', cem.playerId)
  await waitFor(() => ben.voteKick, 8000, 'zweite Abstimmung')
  ben.socket.emit('votekick:vote', false)
  await waitFor(() => ben.voteKickResults.length === 2, 8000, 'zweites Ergebnis')
  check(
    'Nein-Mehrheit lehnt ab',
    ben.voteKickResults.at(-1).outcome === 'failed',
    JSON.stringify(ben.voteKickResults.at(-1))
  )
  check('Cem bleibt drin', host.state.players.some(player => player.nickname === 'Cem'))

  clients.forEach(client => client.socket.disconnect())
}

// ---------------------------------------------------------- Wer bin ich ----

async function werBinIchClient(serverUrl, nickname) {
  const socket = await connect(serverUrl)
  const client = {
    nickname,
    socket,
    lobby: null,
    game: null,
    kickedReason: null,
    voteKick: null
  }
  socket.on('lobby:update', state => { client.lobby = state })
  socket.on('game:state', state => { client.game = state })
  socket.on('lobby:kicked', reason => { client.kickedReason = reason })
  socket.on('lobby:votekick:state', state => { client.voteKick = state })
  return client
}

async function szenarioWerBinIch(serverUrl) {
  console.log('\n=== Wer bin ich: Nachjoinen + Votekick ===')
  const anna = await werBinIchClient(serverUrl, 'Anna')
  const ben = await werBinIchClient(serverUrl, 'Ben')
  const cem = await werBinIchClient(serverUrl, 'Cem')

  const created = await ask(anna.socket, 'lobby:create', 'Anna')
  const code = created.code
  for (const client of [ben, cem]) {
    const response = await ask(client.socket, 'lobby:join', { name: client.nickname, code })
    check(`${client.nickname} tritt bei`, !response.error, JSON.stringify(response))
  }

  await ask(anna.socket, 'game:start')
  await waitFor(() => anna.game, 8000, 'Schreibphase')

  for (const client of [anna, ben, cem]) {
    await waitFor(() => client.game, 8000, `${client.nickname} hat Spielstand`)
    await ask(client.socket, 'game:submitWord', { word: `Wort-von-${client.nickname}` })
  }
  await waitFor(() => anna.game?.state === 'playing', 8000, 'Ratephase erreicht')
  check('Ratephase erreicht', anna.game.state === 'playing')

  // Nachzuegler mitten in der Ratephase.
  const dora = await werBinIchClient(serverUrl, 'Dora')
  const joined = await ask(dora.socket, 'lobby:join', { name: 'Dora', code })
  check('Beitritt ins laufende Spiel wird akzeptiert', !joined.error, JSON.stringify(joined))

  await waitFor(() => dora.game, 8000, 'Dora bekommt Spielstand')
  check('Dora wartet auf ihr Wort', dora.game.myWordPending === true, JSON.stringify(dora.game.myWordPending))
  check('Dora ist im Roster', anna.game.players.some(player => player.name === 'Dora'))

  const author = [anna, ben, cem].find(client => client.game?.needsToWrite)
  check('Jemand bekommt den Schreibauftrag', !!author, 'niemand hat needsToWrite')
  if (author) {
    check('Auftrag zeigt auf Dora', author.game.writeForPlayer === 'Dora', String(author.game.writeForPlayer))
    await ask(author.socket, 'game:submitWord', { word: 'Wort-fuer-Dora' })
    await waitFor(() => dora.game?.myWordPending === false, 8000, 'Dora hat ein Wort')
    check('Dora hat danach ein Wort', dora.game.myWordPending === false)
    const solved = await ask(dora.socket, 'game:solve')
    check('Dora kann loesen', solved.word === 'Wort-fuer-Dora', JSON.stringify(solved))
  }

  // Votekick gegen Dora: 4 Spieler, 3 stimmberechtigt, 2 Ja noetig.
  const doraId = anna.game.players.find(player => player.name === 'Dora').id
  const started = await ask(anna.socket, 'lobby:votekick:start', doraId)
  check('Abstimmung startet', !started.error, JSON.stringify(started))
  await waitFor(() => ben.voteKick, 8000, 'Abstimmung sichtbar')
  check('2 Ja noetig bei 3 Berechtigten', ben.voteKick.needed === 2, `needed=${ben.voteKick.needed}`)
  await ask(ben.socket, 'lobby:votekick:vote', true)
  await waitFor(() => dora.kickedReason, 8000, 'Dora fliegt raus')
  check('Dora wird per Abstimmung entfernt', dora.kickedReason.includes('Abstimmung'), dora.kickedReason)

  for (const client of [anna, ben, cem, dora]) client.socket.disconnect()
}

// ------------------------------------------------------------ Wavelength ----

async function wavelengthClient(serverUrl, nickname) {
  const socket = await connect(serverUrl)
  const client = {
    nickname,
    socket,
    lobby: null,
    game: null,
    phase: null,
    kickedReason: null,
    voteKick: null
  }
  socket.on('wvl:lobby:update', state => { client.lobby = state; client.phase = 'waiting' })
  socket.on('wvl:voting:started', state => { client.lobby = state; client.phase = 'voting' })
  socket.on('wvl:game:state', state => { client.game = state; client.phase = 'playing' })
  socket.on('wvl:result:state', state => { client.game = state; client.phase = 'result' })
  socket.on('wvl:lobby:kicked', reason => { client.kickedReason = reason })
  socket.on('wvl:votekick:state', state => { client.voteKick = state })
  return client
}

async function szenarioWavelength(serverUrl) {
  console.log('\n=== Wavelength: Nachjoinen zur naechsten Runde ===')
  const anna = await wavelengthClient(serverUrl, 'Anna')
  const ben = await wavelengthClient(serverUrl, 'Ben')
  const cem = await wavelengthClient(serverUrl, 'Cem')

  const created = await ask(anna.socket, 'wvl:lobby:create', 'Anna')
  const code = created.code
  for (const client of [ben, cem]) {
    const response = await ask(client.socket, 'wvl:lobby:join', code, client.nickname)
    check(`${client.nickname} tritt bei`, !response.error, JSON.stringify(response))
  }

  await ask(anna.socket, 'wvl:lobby:start')
  await waitFor(() => anna.phase === 'voting', 8000, 'Abstimmungsphase')
  for (const client of [anna, ben, cem]) {
    await ask(client.socket, 'wvl:vote', 7)
  }
  await waitFor(() => anna.phase === 'playing', 8000, 'Spielphase')
  check('Runde laeuft', anna.game.state === 'playing')

  // Nachzuegler mitten in der Runde.
  const dora = await wavelengthClient(serverUrl, 'Dora')
  const joined = await ask(dora.socket, 'wvl:lobby:join', code, 'Dora')
  check('Beitritt in laufende Runde wird akzeptiert', !joined.error, JSON.stringify(joined))
  await waitFor(() => dora.game, 8000, 'Dora bekommt Spielstand')

  const doraInRoster = anna.game.players.find(player => player.name === 'Dora')
  check(
    'Dora ist als wartend markiert',
    doraInRoster?.isWaitingForNextRound === true,
    JSON.stringify(doraInRoster)
  )

  // Der Seeker darf raten, sobald die urspruenglichen Mitspieler geantwortet
  // haben - Dora blockiert die Runde nicht.
  const seekerId = anna.game.seekerId
  const all = [anna, ben, cem]
  const seeker = all.find(client => client.game.myId === seekerId)
  const others = all.filter(client => client.game.myId !== seekerId)
  for (const other of others) {
    await ask(seeker.socket, 'wvl:ask-question', other.game.myId, `Frage an ${other.nickname}?`)
    await waitFor(() => other.game?.canAnswerQuestion, 8000, `${other.nickname} hat eine Frage`)
    await ask(other.socket, 'wvl:answer-question', 'Antwort')
  }
  await waitFor(() => seeker.game?.canMakeGuess, 8000, 'Seeker darf raten')
  check('Nachzuegler blockiert den Seeker nicht', seeker.game.canMakeGuess === true)

  await ask(seeker.socket, 'wvl:make-guess', 7)
  await waitFor(() => anna.phase === 'result', 8000, 'Ergebnis')

  await ask(anna.socket, 'wvl:play-again')
  await waitFor(() => anna.phase === 'voting' || anna.phase === 'waiting', 8000, 'naechste Runde')
  const roster = anna.lobby?.players || anna.game?.players || []
  const doraAfter = roster.find(player => player.name === 'Dora')
  check(
    'Dora ist ab der naechsten Runde dabei',
    doraAfter?.isWaitingForNextRound === false,
    JSON.stringify(doraAfter)
  )

  for (const client of [anna, ben, cem, dora]) client.socket.disconnect()
}

// ------------------------------------------------------------------ main ----

async function main() {
  const { backend, serverUrl, dumpOutput } = startBackend()
  try {
    await waitForHealth(serverUrl)
    console.log(`Backend laeuft auf ${serverUrl}${FAST ? ' (schneller Durchlauf)' : ''}`)
    await szenarioReconnectOhneLimit(serverUrl)
    await szenarioNachjoinenCypher(serverUrl)
    await szenarioVotekickCypher(serverUrl)
    await szenarioWerBinIch(serverUrl)
    await szenarioWavelength(serverUrl)
  } catch (error) {
    failures += 1
    console.error('\nAbbruch:', error.message)
    console.error('--- Backend-Ausgabe ---')
    console.error(dumpOutput())
  } finally {
    backend.kill()
  }

  console.log(`\n${checks - failures}/${checks} Pruefungen bestanden.`)
  if (failures > 0) process.exitCode = 1
}

main()
