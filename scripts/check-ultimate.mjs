// Prüft die Regeln von "TikTacToe Ultimate" — Brettlogik und Sitzrotation.
//
// Warum das hier festgenagelt wird: die Wertung (Unterfeld 1 Punkt, Brett 3
// Punkte, Brett endet sofort bei der Dreierreihe) erzeugt eine Abwägung, die
// sofort kippt, wenn eine dieser Zahlen oder das sofortige Brettende
// verrutscht. Und die 2v2-Rotation ist eine einzige Formel — ein Vorzeichen
// darin vertauscht, und zwei Spieler sitzen plötzlich am selben Brett, ohne
// dass irgendetwas abstürzt.
import {
  createBoard,
  applyMove,
  legalMoves,
  isLegalMove,
  scoreBoard,
  winnerOf
} from '../backend/src/game/UltimateEngine.ts'
import {
  createMatch,
  pendingMoves,
  pendingTeam,
  applyMatchMove,
  seatAt,
  teamSeats
} from '../backend/src/game/UltimateMatch.ts'

let failures = 0

function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) failures += 1
  const suffix = ok ? '' : ` (erwartet ${JSON.stringify(expected)})`
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${label}: ${JSON.stringify(actual)}${suffix}`)
}

// Setzt ein Zeichen ohne Rücksicht auf den Unterfeld-Zwang. Nur zum Aufbauen
// von Teststellungen — die Siegerkennung und das Brettende laufen dabei durch
// die echte Engine, damit hier keine zweite Regelauslegung entsteht.
function force(board, sub, cell, mark) {
  const result = applyMove({ ...board, forcedSub: null }, { sub, cell }, mark)
  if (!result.ok) throw new Error(`Aufbau fehlgeschlagen bei ${sub}/${cell}: ${result.error}`)
  return result.board
}

function winSub(board, sub, mark) {
  let next = board
  for (const cell of [0, 1, 2]) next = force(next, sub, cell, mark)
  return next
}

// Volles Unterfeld ohne Sieger.
function drawSub(board, sub) {
  const pattern = ['X', 'O', 'X', 'X', 'O', 'O', 'O', 'X', 'X']
  let next = board
  pattern.forEach((mark, cell) => { next = force(next, sub, cell, mark) })
  return next
}

console.log('--- Brettregeln ---')

// Die gespielte Zelle gibt das nächste Unterfeld vor.
{
  const result = applyMove(createBoard(), { sub: 4, cell: 2 }, 'X')
  check('Zelle 2 schickt in Unterfeld 2', result.ok && result.board.forcedSub, 2)
  check('Erster Zug ist überall erlaubt', legalMoves(createBoard()).length, 81)
}

// Entschiedenes Zielunterfeld -> freie Wahl.
{
  let board = winSub(createBoard(), 2, 'X')
  check('Unterfeld 2 gewonnen', board.subs[2].result, 'X')
  check('Brett läuft nach einem Unterfeld weiter', board.result, null)

  const result = applyMove({ ...board, forcedSub: 0 }, { sub: 0, cell: 2 }, 'O')
  check('Ziel entschieden -> freie Wahl', result.ok && result.board.forcedSub, null)

  // Freie Wahl heißt: alles außer dem geschlossenen Unterfeld 2.
  const open = legalMoves(result.board).filter(move => move.sub === 2).length
  check('Geschlossenes Unterfeld bleibt gesperrt', open, 0)
}

// Volles Unterfeld ohne Sieger zählt nicht.
{
  const board = drawSub(createBoard(), 0)
  check('Volles Unterfeld ohne Sieger ist unentschieden', board.subs[0].result, 'draw')
  check('Unentschiedenes Unterfeld gibt keine Punkte', scoreBoard(board), { X: 0, O: 0 })
  check('Unentschiedenes Unterfeld hilft keiner Dreierreihe', winnerOf([board.subs[0].result === 'X' ? 'X' : null, null, null, null, null, null, null, null, null]), null)
}

// Dreierreihe beendet das Brett sofort, Rest bleibt ungespielt.
{
  let board = createBoard()
  board = winSub(board, 0, 'X')
  board = winSub(board, 1, 'X')
  check('Zwei Unterfelder reichen noch nicht', board.result, null)
  board = winSub(board, 2, 'X')

  check('Dreierreihe beendet das Brett', board.result, 'X')
  check('Kein Zug mehr möglich', legalMoves(board).length, 0)
  check('Restliche Unterfelder bleiben offen und wertlos', board.subs[4].result, null)
  // 3 Unterfelder je 1 Punkt + 3 für das Brett = 6.
  check('Punkte bei sofortigem Brettsieg', scoreBoard(board), { X: 6, O: 0 })

  const blocked = applyMove(board, { sub: 4, cell: 4 }, 'O')
  check('Zug auf fertigem Brett abgewiesen', blocked.ok === false && blocked.error, 'board-finished')
}

// Wertung mit gemischten Unterfeldern.
{
  let board = createBoard()
  board = winSub(board, 4, 'O')
  board = drawSub(board, 8)
  board = winSub(board, 0, 'X')
  check('X 1 Unterfeld, O 1 Unterfeld, 1 unentschieden', scoreBoard(board), { X: 1, O: 1 })
}

// Abgewiesene Züge.
{
  const start = applyMove(createBoard(), { sub: 4, cell: 2 }, 'X').board
  check('Falsches Unterfeld', applyMove(start, { sub: 5, cell: 0 }, 'O').error, 'wrong-sub')
  check('Belegte Zelle', applyMove({ ...start, forcedSub: 4 }, { sub: 4, cell: 2 }, 'O').error, 'cell-taken')
  check('Unterfeld außerhalb', applyMove(start, { sub: 9, cell: 0 }, 'O').error, 'out-of-range')
  check('Zelle außerhalb', applyMove(start, { sub: 2, cell: -1 }, 'O').error, 'out-of-range')

  const closed = { ...winSub(createBoard(), 3, 'X'), forcedSub: null }
  check('Geschlossenes Unterfeld', applyMove(closed, { sub: 3, cell: 4 }, 'O').error, 'sub-closed')
  check('isLegalMove stimmt mit applyMove überein', isLegalMove(closed, { sub: 3, cell: 4 }), false)
}

console.log('\n--- 1v1 ---')

{
  const match = createMatch('1v1')
  check('Ein Brett', match.boards.length, 1)
  check('Teamplätze 1v1', [teamSeats('1v1', 'X'), teamSeats('1v1', 'O')], [[0], [1]])
  check('X beginnt, Platz 0', pendingMoves(match), [{ board: 0, team: 'X', seat: 0 }])

  const wrong = applyMatchMove(match, 1, 0, { sub: 0, cell: 0 })
  check('O darf nicht vorgreifen', wrong.ok === false && wrong.error, 'not-your-turn')

  const first = applyMatchMove(match, 0, 0, { sub: 4, cell: 4 })
  check('X gezogen -> O ist dran', pendingMoves(first.match), [{ board: 0, team: 'O', seat: 1 }])
  check('Runde noch nicht vorbei', first.roundAdvanced, false)

  const second = applyMatchMove(first.match, 1, 0, { sub: 4, cell: 0 })
  check('Nach X und O ist die Runde um', second.roundAdvanced, true)
  check('Runde hochgezählt', second.match.round, 1)
  check('Im 1v1 bleiben die Plätze fest', pendingMoves(second.match), [{ board: 0, team: 'X', seat: 0 }])
}

console.log('\n--- 2v2: Sitzordnung und Tausch ---')

{
  const match = createMatch('2v2')
  check('Zwei Bretter', match.boards.length, 2)
  check('Teamplätze 2v2 (A,B gegen C,D)', [teamSeats('2v2', 'X'), teamSeats('2v2', 'O')], [[0, 1], [2, 3]])

  // Runde 0: A links, B rechts; C links, D rechts.
  check('Runde 0: X-Plätze', [seatAt('2v2', 'X', 0, 0), seatAt('2v2', 'X', 1, 0)], [0, 1])
  check('Runde 0: O-Plätze', [seatAt('2v2', 'O', 0, 0), seatAt('2v2', 'O', 1, 0)], [2, 3])
  // Runde 1: getauscht.
  check('Runde 1: X-Plätze getauscht', [seatAt('2v2', 'X', 0, 1), seatAt('2v2', 'X', 1, 1)], [1, 0])
  check('Runde 1: O-Plätze getauscht', [seatAt('2v2', 'O', 0, 1), seatAt('2v2', 'O', 1, 1)], [3, 2])
  // Runde 2 ist wieder wie Runde 0.
  check('Runde 2 wie Runde 0', [seatAt('2v2', 'X', 0, 2), seatAt('2v2', 'X', 1, 2)], [0, 1])

  check('Beide Bretter warten auf X', pendingMoves(match), [
    { board: 0, team: 'X', seat: 0 },
    { board: 1, team: 'X', seat: 1 }
  ])

  // B (Platz 1) sitzt rechts und darf links nicht ziehen.
  const wrongBoard = applyMatchMove(match, 1, 0, { sub: 0, cell: 0 })
  check('Partner darf nicht am fremden Brett ziehen', wrongBoard.ok === false && wrongBoard.error, 'not-your-turn')

  // A zieht links.
  let state = applyMatchMove(match, 0, 0, { sub: 4, cell: 4 }).match
  check('Links wartet jetzt auf C', pendingTeam(state, 0), 'O')
  check('Rechts wartet weiter auf X', pendingTeam(state, 1), 'X')

  // C zieht links -> Brett 0 ist in dieser Runde fertig, Runde aber nicht.
  state = applyMatchMove(state, 2, 0, { sub: 4, cell: 0 }).match
  check('Links in dieser Runde durch', pendingTeam(state, 0), null)
  check('Gleichschritt: Runde wartet auf rechts', state.round, 0)
  check('Nur noch rechts offen', pendingMoves(state), [{ board: 1, team: 'X', seat: 1 }])

  const tooEarly = applyMatchMove(state, 0, 0, { sub: 4, cell: 1 })
  check('Zweiter Zug am selben Brett in derselben Runde abgewiesen', tooEarly.ok === false && tooEarly.error, 'already-moved-this-round')

  // B und D ziehen rechts -> Runde vorbei, Seiten getauscht.
  state = applyMatchMove(state, 1, 1, { sub: 0, cell: 8 }).match
  const closing = applyMatchMove(state, 3, 1, { sub: 8, cell: 0 })
  check('Runde geschlossen', closing.roundAdvanced, true)
  check('Runde 1 erreicht', closing.match.round, 1)
  check('Nach dem Tausch sitzt B links und A rechts', pendingMoves(closing.match), [
    { board: 0, team: 'X', seat: 1 },
    { board: 1, team: 'X', seat: 0 }
  ])
}

console.log('\n--- 2v2: fertiges Brett und Partieende ---')

{
  // Brett 0 ist fertig (O hat die Dreierreihe), Brett 1 läuft noch.
  let done = createBoard()
  done = winSub(done, 0, 'O')
  done = winSub(done, 1, 'O')
  done = winSub(done, 2, 'O')

  const match = { ...createMatch('2v2'), boards: [done, createBoard()] }
  check('Fertiges Brett liefert keinen offenen Zug', pendingMoves(match).map(entry => entry.board), [1])

  const onDone = applyMatchMove(match, 0, 0, { sub: 4, cell: 4 })
  check('Zug am fertigen Brett abgewiesen', onDone.ok === false && onDone.error, 'board-finished')

  // Nur rechts gespielt -> die Runde zählt trotzdem als voll.
  let state = applyMatchMove(match, 1, 1, { sub: 4, cell: 4 }).match
  const closing = applyMatchMove(state, 3, 1, { sub: 4, cell: 0 })
  check('Runde schließt trotz fertigem Brett', closing.roundAdvanced, true)
  check('Alle vier spielen am Restbrett weiter: jetzt A', pendingMoves(closing.match), [{ board: 1, team: 'X', seat: 0 }])
}

{
  // Partieende: Brett 0 gehört O (6 Punkte), Brett 1 geht an X mit einem
  // Unterfeld extra (7 Punkte) -> X gewinnt nach Punkten.
  let left = createBoard()
  left = winSub(left, 0, 'O')
  left = winSub(left, 1, 'O')
  left = winSub(left, 2, 'O')

  let right = createBoard()
  right = winSub(right, 4, 'X')   // Zusatzpunkt, schließt keine Reihe
  right = winSub(right, 0, 'X')
  right = winSub(right, 1, 'X')
  right = force(right, 2, 0, 'X')
  right = force(right, 2, 1, 'X') // ein Zug vor der Dreierreihe
  right = { ...right, forcedSub: null }

  const match = { ...createMatch('2v2'), boards: [left, right] }
  check('Vor dem letzten Zug läuft die Partie', match.finished, false)

  const last = applyMatchMove(match, 1, 1, { sub: 2, cell: 2 })
  check('Letzter Zug angenommen', last.ok, true)
  check('Partie beendet', last.match.finished, true)
  // O: 3 Unterfelder + Brett = 6. X: 4 Unterfelder + Brett = 7.
  check('Endstand', last.match.score, { X: 7, O: 6 })
  check('Sieger nach Punkten', last.match.winner, 'X')

  const after = applyMatchMove(last.match, 0, 1, { sub: 3, cell: 3 })
  check('Nach Partieende kein Zug mehr', after.ok === false && after.error, 'match-finished')
}

{
  // Gleichstand: beide Bretter mit identischer Ausbeute -> unentschieden.
  let left = createBoard()
  left = winSub(left, 0, 'O')
  left = winSub(left, 1, 'O')
  left = winSub(left, 2, 'O')

  let right = createBoard()
  right = winSub(right, 0, 'X')
  right = winSub(right, 1, 'X')
  right = force(right, 2, 0, 'X')
  right = force(right, 2, 1, 'X')
  right = { ...right, forcedSub: null }

  const match = { ...createMatch('2v2'), boards: [left, right] }
  const last = applyMatchMove(match, 1, 1, { sub: 2, cell: 2 })
  check('Gleichstand 6:6', last.match.score, { X: 6, O: 6 })
  check('Unentschieden erkannt', last.match.winner, 'draw')
}

if (failures > 0) {
  console.log(`\n${failures} Prüfung(en) fehlgeschlagen.`)
  process.exit(1)
}
console.log('\nAlle Prüfungen bestanden.')
