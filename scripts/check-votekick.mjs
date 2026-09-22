// Prüft die Mehrheitslogik des Votekicks.
//
// Die Schwelle ist das Einzige an der Abstimmung, das man nicht ansieht: sie
// hängt an den *verbundenen* Spielern ohne den Betroffenen und verschiebt sich,
// wenn jemand mitten in der Abstimmung rausfliegt. Deshalb hier festgenagelt.
import {
  startVoteKick,
  castVoteKickVote,
  cancelVoteKick,
  getVoteKick
} from '../backend/src/game/VoteKick.ts'

let failures = 0

function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) failures += 1
  const suffix = ok ? '' : ` (erwartet ${JSON.stringify(expected)})`
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${label}: ${JSON.stringify(actual)}${suffix}`)
}

// Spielt eine Abstimmung durch und gibt das Ergebnis zurück ([] = noch offen).
function run(eligible, votes) {
  const events = []
  let recording = true
  cancelVoteKick('L')
  try {
    startVoteKick({
      lobbyCode: 'L',
      targetId: 'T',
      targetName: 'Target',
      initiatorId: eligible[0],
      getEligibleIds: () => eligible,
      onChange: (_state, outcome) => {
        if (outcome && recording) events.push(outcome)
      }
    })
  } catch (error) {
    events.push(`refused:${error.message}`)
    return events
  }
  for (const [voter, approve] of votes) {
    if (events.length) break
    castVoteKickVote('L', voter, approve)
  }
  // Aufräumen darf das Ergebnis nicht mehr verfälschen: ein noch offener
  // Durchlauf meldet sonst zusätzlich 'cancelled'.
  recording = false
  cancelVoteKick('L')
  return events
}

// 5 Spieler, Ziel raus -> 4 stimmberechtigt, 3 Ja nötig.
check('5 Spieler: Starter + 2 Ja kickt', run(['a', 'b', 'c', 'd'], [['b', true], ['c', true]]), ['passed'])
check('5 Spieler: Starter + 1 Ja reicht nicht', run(['a', 'b', 'c', 'd'], [['b', true]]), [])
check('5 Spieler: 3 Nein lehnen ab', run(['a', 'b', 'c', 'd'], [['b', false], ['c', false], ['d', false]]), ['failed'])
// Bei 4 Berechtigten und 3 nötigen Ja machen schon 2 Nein den Sieg unmöglich.
check('5 Spieler: 2 Nein beenden sofort', run(['a', 'b', 'c', 'd'], [['b', false], ['c', false]]), ['failed'])

// 3 Spieler, Ziel raus -> 2 stimmberechtigt, 2 Ja nötig.
check('3 Spieler: beide Ja kickt', run(['a', 'b'], [['b', true]]), ['passed'])
check('3 Spieler: Starter allein reicht nicht', run(['a', 'b'], []), [])
// Bei 2 Berechtigten müssen beide zustimmen, ein Nein entscheidet sofort.
check('3 Spieler: ein Nein beendet sofort', run(['a', 'b'], [['b', false]]), ['failed'])

// 2 Spieler, Ziel raus -> 1 stimmberechtigt: eine Stimme darf nicht reichen.
check('2 Spieler: Abstimmung verweigert', run(['a'], []), ['refused:Dafür sind zu wenige Spieler verbunden.'])

// Das Ziel darf nicht mitstimmen, der Startende zählt als Ja.
cancelVoteKick('L')
startVoteKick({
  lobbyCode: 'L',
  targetId: 'T',
  targetName: 'Target',
  initiatorId: 'a',
  getEligibleIds: () => ['a', 'b', 'c', 'd'],
  onChange: () => {}
})
let targetError = ''
try {
  castVoteKickVote('L', 'T', false)
} catch (error) {
  targetError = error.message
}
check('Ziel darf nicht abstimmen', targetError, 'Du kannst nicht über deinen eigenen Rauswurf abstimmen.')
check('Startender zählt als Ja', getVoteKick('L')?.approvedBy, ['a'])
check('Schwelle bei 4 Berechtigten', getVoteKick('L')?.needed, 3)
cancelVoteKick('L')

if (failures > 0) {
  console.log(`\n${failures} Prüfung(en) fehlgeschlagen.`)
  process.exit(1)
}
console.log('\nAlle Prüfungen bestanden.')
