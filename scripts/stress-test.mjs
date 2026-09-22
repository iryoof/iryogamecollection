import { spawn } from 'node:child_process'
import process from 'node:process'
import { setTimeout as delay } from 'node:timers/promises'
import { io as createSocket } from 'socket.io-client'

const ROUND_TIMEOUT_MS = 10000

function assert(condition, message) {
  if (!condition) {
    throw new Error(message)
  }
}

async function waitFor(predicate, timeoutMs, label) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const value = predicate()
    if (value) {
      return value
    }
    await delay(50)
  }
  throw new Error(`Timeout while waiting for ${label}`)
}

async function waitForEvent(client, eventName, predicate = () => true, timeoutMs = ROUND_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup()
      reject(new Error(`Timeout while waiting for event "${eventName}" on ${client.nickname}`))
    }, timeoutMs)

    const handler = (...args) => {
      if (!predicate(...args)) return
      cleanup()
      resolve(args)
    }

    const cleanup = () => {
      clearTimeout(timeout)
      client.socket.off(eventName, handler)
    }

    client.socket.on(eventName, handler)
  })
}

async function waitForHealth(serverUrl) {
  const start = Date.now()
  while (Date.now() - start < 15000) {
    try {
      const response = await fetch(`${serverUrl}/health`)
      if (response.ok) {
        return
      }
    } catch {
      // server not ready yet
    }
    await delay(100)
  }
  throw new Error('Backend health check did not become ready')
}

function createClient(serverUrl, playerId, nickname) {
  const socket = createSocket(serverUrl, {
    transports: ['websocket'],
    forceNew: true,
    reconnection: false
  })

  const client = {
    playerId,
    nickname,
    socket,
    state: null,
    errors: [],
    roundsStarted: [],
    roundCompleteCount: 0,
    votingStartedCount: 0,
    votingComplete: null,
    lobbyClosedCount: 0
  }

  socket.on('state-update', state => {
    client.state = state
  })
  socket.on('lobby-joined', state => {
    client.state = state
  })
  socket.on('lobby-created', (_code, state) => {
    client.state = state
  })
  socket.on('round-started', roundNumber => {
    client.roundsStarted.push(roundNumber)
  })
  socket.on('round-complete', () => {
    client.roundCompleteCount += 1
  })
  socket.on('voting-started', () => {
    client.votingStartedCount += 1
  })
  socket.on('voting-complete', (archive, results) => {
    client.votingComplete = { archive, results }
  })
  socket.on('lobby-closed', () => {
    client.lobbyClosedCount += 1
  })
  socket.on('error', message => {
    client.errors.push(String(message))
  })

  return client
}

async function connectClient(client) {
  if (client.socket.connected) return
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Connect timeout for ${client.nickname}`)), 8000)
    client.socket.once('connect', () => {
      clearTimeout(timeout)
      resolve()
    })
    client.socket.once('connect_error', error => {
      clearTimeout(timeout)
      reject(error)
    })
  })
}

async function cleanupClients(clients) {
  await Promise.all(clients.map(async client => {
    if (client.socket.connected) {
      client.socket.disconnect()
    }
  }))
}

function expectedErrorPromise(client, substring, timeoutMs = 5000) {
  return waitFor(
    () => client.errors.find(message => message.includes(substring)),
    timeoutMs,
    `${client.nickname} error "${substring}"`
  )
}

async function reconnectClient(client, lobbyCode) {
  client.socket.disconnect()
  await delay(250)
  const reconnectPromise = connectClient(client)
  client.socket.connect()
  await reconnectPromise
  client.socket.emit('join-lobby', lobbyCode, client.nickname, client.playerId)
  await waitForEvent(client, 'lobby-joined')
}

async function createAndJoinLobby(clients) {
  const host = clients[0]
  const [createdCode] = await Promise.all([
    waitForEvent(host, 'lobby-created'),
    (async () => {
      host.socket.emit(
        'create-lobby',
        { playerCount: clients.length, timerEnabled: false, timerSeconds: 60 },
        host.nickname,
        host.playerId
      )
    })()
  ]).then(values => values[0])

  await Promise.all(clients.slice(1).map(async client => {
    await Promise.all([
      waitForEvent(client, 'lobby-joined'),
      (async () => {
        client.socket.emit('join-lobby', createdCode, client.nickname, client.playerId)
      })()
    ])
  }))

  await Promise.all(clients.map(client =>
    waitFor(() => client.state?.players?.length === clients.length, 8000, `${client.nickname} full lobby state`)
  ))

  return createdCode
}

async function startGame(host, clients, roundNumber = 1) {
  await Promise.all([
    ...clients.map(client => waitForEvent(client, 'round-started', seenRound => seenRound === roundNumber)),
    (async () => host.socket.emit('start-game'))()
  ])
}

async function nextRound(host, clients, roundNumber) {
  await Promise.all([
    ...clients.map(client => waitForEvent(client, 'round-started', seenRound => seenRound === roundNumber)),
    (async () => host.socket.emit('next-round'))()
  ])
}

async function submitRound(clients, roundNumber, submittedTextFactory) {
  const completionTarget = roundNumber
  await Promise.all(clients.map(async (client, index) => {
    client.socket.emit('submit-text', submittedTextFactory(index))
  }))

  await Promise.all(clients.map(client =>
    waitFor(() => client.roundCompleteCount >= completionTarget, ROUND_TIMEOUT_MS, `${client.nickname} round ${roundNumber} complete`)
  ))
}

async function startVoting(host, clients) {
  await Promise.all([
    ...clients.map(client => waitForEvent(client, 'voting-started')),
    (async () => host.socket.emit('end-game'))()
  ])
}

async function completeVotingWithVotes(clients, picks) {
  await Promise.all(clients.map(async (client, index) => {
    client.socket.emit('submit-vote', picks(index))
  }))
  await Promise.all(clients.map(client =>
    waitFor(() => !!client.votingComplete, ROUND_TIMEOUT_MS, `${client.nickname} voting completion`)
  ))
}

async function completeVotingWithSkip(host, clients, partialVotes = []) {
  partialVotes.forEach(({ client, pick }) => {
    client.socket.emit('submit-vote', pick)
  })

  await Promise.all([
    ...clients.map(client => waitForEvent(client, 'voting-complete')),
    (async () => host.socket.emit('skip-voting'))()
  ])
}

async function fetchStats(serverUrl) {
  const response = await fetch(`${serverUrl}/api/stats`)
  return response.json()
}

function buildClientSet(serverUrl, playerCount, prefix) {
  return Array.from({ length: playerCount }, (_, index) =>
    createClient(serverUrl, `${prefix}-player-${index}`, `${prefix}${index + 1}`)
  )
}

async function runScenario(name, scenarioFn) {
  const port = 3200 + Math.floor(Math.random() * 2000)
  const serverUrl = `http://127.0.0.1:${port}`
  console.log(`\n=== ${name} ===`)
  console.log(`Starting backend on ${serverUrl}`)

  const backend = spawn(
    process.execPath,
    ['backend/dist/server.js'],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        PORT: String(port),
        FRONTEND_URL: 'http://localhost:5173'
      },
      stdio: ['ignore', 'pipe', 'pipe']
    }
  )

  let backendOutput = ''
  backend.stdout.on('data', chunk => {
    backendOutput += chunk.toString()
  })
  backend.stderr.on('data', chunk => {
    backendOutput += chunk.toString()
  })

  const clients = []

  try {
    await waitForHealth(serverUrl)
    await scenarioFn({
      serverUrl,
      clients,
      createClients(playerCount, prefix = 'Stress') {
        const created = buildClientSet(serverUrl, playerCount, prefix)
        clients.push(...created)
        return created
      },
      async connectAll(group) {
        await Promise.all(group.map(connectClient))
      }
    })
    console.log(`${name}: passed`)
  } catch (error) {
    console.error(`${name}: failed`)
    console.error(error)
    if (backendOutput.trim()) {
      console.error(backendOutput)
    }
    throw error
  } finally {
    await cleanupClients(clients)
    backend.kill('SIGTERM')
    await Promise.race([
      new Promise(resolve => backend.once('exit', resolve)),
      delay(2000)
    ])
    if (backend.exitCode === null) {
      backend.kill('SIGKILL')
      await Promise.race([
        new Promise(resolve => backend.once('exit', resolve)),
        delay(2000)
      ])
    }
  }
}

async function scenarioBaseline(ctx) {
  const clients = ctx.createClients(6, 'Base')
  await ctx.connectAll(clients)

  const host = clients[0]
  const lobbyCode = await createAndJoinLobby(clients)
  await startGame(host, clients, 1)

  host.socket.emit('next-round')
  await expectedErrorPromise(host, 'Die Runde ist noch nicht fertig')

  await submitRound(clients, 1, index => `r1-a-${index}\nr1-b-${index}`)
  host.socket.emit('submit-text', 'duplicate\nsubmit')
  await expectedErrorPromise(host, 'schon abgegeben')

  await reconnectClient(clients[5], lobbyCode)
  await nextRound(host, clients, 2)
  await submitRound(clients, 2, index => `round2-${index}`)

  await startVoting(host, clients)
  await completeVotingWithSkip(host, clients, [
    { client: clients[1], pick: 0 },
    { client: clients[2], pick: 1 }
  ])

  const archive = clients[0].votingComplete.archive
  assert(archive.finalTexts.length === clients.length, 'Baseline archive final text count mismatch')
  assert(archive.rounds.every(round => round.length >= 3), 'Baseline archive should accumulate at least 3 lines per text')

  const stats = await fetchStats(ctx.serverUrl)
  assert(stats.totalGames === 1, `Baseline stats should equal 1 game, got ${stats.totalGames}`)
}

async function scenarioHeavyRounds(ctx) {
  const clients = ctx.createClients(8, 'Heavy')
  await ctx.connectAll(clients)

  const host = clients[0]
  await createAndJoinLobby(clients)
  await startGame(host, clients, 1)
  await submitRound(clients, 1, index => `heavy-r1-line1-${index}\nheavy-r1-line2-${index}`)

  for (let round = 2; round <= 5; round += 1) {
    await nextRound(host, clients, round)
    await submitRound(clients, round, index => `heavy-r${round}-${index}`)
  }

  await startVoting(host, clients)
  const duplicateVote = expectedErrorPromise(clients[0], 'schon abgestimmt')
  clients[0].socket.emit('submit-vote', 0)
  clients[0].socket.emit('submit-vote', 1)
  await duplicateVote

  await completeVotingWithVotes(clients.slice(1), index => (index + 1) % clients.length)
  await waitFor(() => !!clients[0].votingComplete, ROUND_TIMEOUT_MS, 'host voting completion')

  const archive = clients[0].votingComplete.archive
  assert(archive.finalTexts.length === clients.length, 'Heavy archive final text count mismatch')
  assert(archive.rounds.every(round => round.length === 6), 'Heavy archive should have 6 lines per text after 5 rounds')

  const stats = await fetchStats(ctx.serverUrl)
  assert(stats.totalGames === 1, `Heavy stats should equal 1 game, got ${stats.totalGames}`)
}

async function scenarioHostReconnect(ctx) {
  const clients = ctx.createClients(5, 'Host')
  await ctx.connectAll(clients)

  const host = clients[0]
  const lobbyCode = await createAndJoinLobby(clients)
  await startGame(host, clients, 1)
  await submitRound(clients, 1, index => `host-r1-a-${index}\nhost-r1-b-${index}`)

  await reconnectClient(host, lobbyCode)
  host.socket.emit('submit-vote', 0)
  await expectedErrorPromise(host, 'keine Abstimmung')

  await nextRound(host, clients, 2)
  await submitRound(clients, 2, index => `host-r2-${index}`)

  await reconnectClient(host, lobbyCode)
  await startVoting(host, clients)
  await completeVotingWithSkip(host, clients)

  const archive = clients[1].votingComplete.archive
  assert(archive.finalTexts.length === clients.length, 'Host reconnect archive mismatch')
}

async function scenarioDuplicateTab(ctx) {
  const clients = ctx.createClients(4, 'Tab')
  await ctx.connectAll(clients)

  const host = clients[0]
  const lobbyCode = await createAndJoinLobby(clients)

  const shadowTab = createClient(ctx.serverUrl, clients[1].playerId, `${clients[1].nickname}-shadow`)
  ctx.clients.push(shadowTab)
  await connectClient(shadowTab)

  await Promise.all([
    waitForEvent(shadowTab, 'lobby-joined'),
    (async () => shadowTab.socket.emit('join-lobby', lobbyCode, clients[1].nickname, clients[1].playerId))()
  ])

  await Promise.all(clients.map(client =>
    waitFor(() => client.state?.players?.length === 4, 8000, `${client.nickname} stable player count after shadow tab`)
  ))
  assert(shadowTab.state?.players?.length === 4, 'Shadow tab should not create an extra player')

  await Promise.all([
    waitForEvent(shadowTab, 'round-started', round => round === 1),
    startGame(host, clients, 1)
  ])

  const nonHostStart = expectedErrorPromise(clients[2], 'Nur der Host kann das Spiel starten')
  clients[2].socket.emit('start-game')
  await nonHostStart

  await submitRound(clients, 1, index => `tab-r1-a-${index}\ntab-r1-b-${index}`)
  await startVoting(host, clients)
  await completeVotingWithSkip(host, clients)

  const stats = await fetchStats(ctx.serverUrl)
  assert(stats.totalGames === 1, `Duplicate tab stats should equal 1 game, got ${stats.totalGames}`)
}

async function scenarioPregameLeaveAndClose(ctx) {
  const clients = ctx.createClients(4, 'Lobby')
  await ctx.connectAll(clients)

  const host = clients[0]
  await createAndJoinLobby(clients)

  // Non-hosts still cannot call close-lobby.
  const nonHostCloseError = expectedErrorPromise(clients[1], 'Nur der Host kann die Lobby')
  clients[1].socket.emit('close-lobby')
  await nonHostCloseError

  clients[3].socket.emit('leave-lobby')
  await Promise.all(clients.slice(0, 3).map(client =>
    waitFor(() => client.state?.players?.length === 3, 8000, `${client.nickname} updated player count after leave`)
  ))

  // Host leaves: host role should migrate to the next player and the lobby
  // should remain open.
  host.socket.emit('leave-lobby')
  const newHost = clients[1]
  await Promise.all(clients.slice(1, 3).map(client =>
    waitFor(
      () => client.state?.players?.length === 2 && client.state?.hostId === newHost.playerId,
      8000,
      `${client.nickname} saw host migration to ${newHost.nickname}`
    )
  ))

  newHost.socket.emit('close-lobby')
  await Promise.all(clients.slice(1, 3).map(client =>
    waitFor(() => client.lobbyClosedCount === 1, 8000, `${client.nickname} lobby closed event`)
  ))

  const stats = await fetchStats(ctx.serverUrl)
  assert(stats.totalGames === 0, `Pregame close should not count as a completed game, got ${stats.totalGames}`)
}

async function scenarioSoak(ctx, runCount) {
  for (let run = 1; run <= runCount; run += 1) {
    const clients = ctx.createClients(6, `Soak${run}`)
    await ctx.connectAll(clients)
    const host = clients[0]
    await createAndJoinLobby(clients)
    await startGame(host, clients, 1)
    await submitRound(clients, 1, index => `soak-${run}-r1a-${index}\nsoak-${run}-r1b-${index}`)
    await nextRound(host, clients, 2)
    await submitRound(clients, 2, index => `soak-${run}-r2-${index}`)
    await startVoting(host, clients)
    await completeVotingWithSkip(host, clients)
  }

  const stats = await fetchStats(ctx.serverUrl)
  assert(stats.totalGames === runCount, `Soak stats should equal ${runCount} games, got ${stats.totalGames}`)
}

async function main() {
  const scenarios = [
    ['Baseline Reconnect And Skip', scenarioBaseline],
    ['Heavy Multi Round Voting', scenarioHeavyRounds],
    ['Host Reconnect', scenarioHostReconnect],
    ['Duplicate Tab Shadow Client', scenarioDuplicateTab],
    ['Pregame Leave And Close', scenarioPregameLeaveAndClose],
    ['Repeated Soak', ctx => scenarioSoak(ctx, 3)]
  ]

  const startedAt = Date.now()
  for (const [name, runner] of scenarios) {
    await runScenario(name, runner)
  }

  console.log('\nAll stress scenarios passed')
  console.log(JSON.stringify({
    scenarios: scenarios.length,
    durationMs: Date.now() - startedAt
  }, null, 2))
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
