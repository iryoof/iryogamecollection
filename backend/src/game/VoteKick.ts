/**
 * Vote kick shared by all three multiplayer games.
 *
 * Any player may start a vote against any other player in their lobby; it
 * passes on a simple majority of the *connected* players excluding the target.
 * The target is excluded because otherwise they could block their own kick, and
 * disconnected players are excluded because the reconnect window is open-ended
 * since the "Reconnect ohne Zeitlimit" change — counting them would let one
 * absent player freeze a lobby forever.
 *
 * The three games keep their own lobby types, so this module stays generic:
 * the caller supplies a function that returns the currently eligible voter ids
 * and a callback for broadcasting / carrying out the kick.
 */

import { VoteKickOutcome, VoteKickState } from 'shared/types'

export { VoteKickOutcome, VoteKickState }

// How long a vote stays open before it lapses.
export const VOTE_KICK_TTL_MS = 60_000

// Fewer eligible voters than this and a single person could kick alone, so the
// vote is refused instead.
const MIN_ELIGIBLE_VOTERS = 2

interface Poll {
  targetId: string
  targetName: string
  initiatorId: string
  votes: Map<string, boolean>
  expiresAt: number
  timer: NodeJS.Timeout
  getEligibleIds: () => string[]
  onChange: (state: VoteKickState | null, outcome: VoteKickOutcome | null) => void
}

export interface StartVoteKickOptions {
  lobbyCode: string
  targetId: string
  targetName: string
  initiatorId: string
  /** Connected players except the target, re-read on every vote. */
  getEligibleIds: () => string[]
  onChange: (state: VoteKickState | null, outcome: VoteKickOutcome | null) => void
}

// One open vote per lobby at a time, keyed by lobby code.
const polls = new Map<string, Poll>()

function requiredVotes(eligibleCount: number): number {
  return Math.floor(eligibleCount / 2) + 1
}

function buildState(poll: Poll, eligibleIds: string[]): VoteKickState {
  const approvedBy: string[] = []
  const rejectedBy: string[] = []
  poll.votes.forEach((approve, voterId) => {
    if (!eligibleIds.includes(voterId)) return
    if (approve) {
      approvedBy.push(voterId)
    } else {
      rejectedBy.push(voterId)
    }
  })

  return {
    targetId: poll.targetId,
    targetName: poll.targetName,
    initiatorId: poll.initiatorId,
    approvedBy,
    rejectedBy,
    needed: requiredVotes(eligibleIds.length),
    eligible: eligibleIds.length,
    expiresAt: poll.expiresAt
  }
}

function closePoll(lobbyCode: string, outcome: VoteKickOutcome): void {
  const poll = polls.get(lobbyCode)
  if (!poll) return
  clearTimeout(poll.timer)
  polls.delete(lobbyCode)
  poll.onChange(null, outcome)
}

/**
 * Evaluate the current tally. Closes the poll and reports the outcome as soon
 * as one side has an unbeatable majority, otherwise broadcasts the new state.
 */
function evaluate(lobbyCode: string): void {
  const poll = polls.get(lobbyCode)
  if (!poll) return

  const eligibleIds = poll.getEligibleIds()
  const state = buildState(poll, eligibleIds)

  // Everyone who could still decide it is gone — nothing left to vote on.
  if (eligibleIds.length < MIN_ELIGIBLE_VOTERS) {
    closePoll(lobbyCode, 'cancelled')
    return
  }

  if (state.approvedBy.length >= state.needed) {
    clearTimeout(poll.timer)
    polls.delete(lobbyCode)
    poll.onChange(null, 'passed')
    return
  }

  if (state.rejectedBy.length >= state.needed) {
    clearTimeout(poll.timer)
    polls.delete(lobbyCode)
    poll.onChange(null, 'failed')
    return
  }

  poll.onChange(state, null)
}

export function getVoteKick(lobbyCode: string): VoteKickState | null {
  const poll = polls.get(lobbyCode)
  if (!poll) return null
  return buildState(poll, poll.getEligibleIds())
}

export function isVoteKickTarget(lobbyCode: string, playerId: string): boolean {
  return polls.get(lobbyCode)?.targetId === playerId
}

/**
 * Open a vote. Throws with a message meant for the client if the vote is not
 * allowed (too few players, a vote already running, ...).
 */
export function startVoteKick(options: StartVoteKickOptions): VoteKickState {
  const { lobbyCode, targetId, targetName, initiatorId, getEligibleIds, onChange } = options

  if (polls.has(lobbyCode)) {
    throw new Error('Es läuft bereits eine Abstimmung.')
  }
  if (targetId === initiatorId) {
    throw new Error('Du kannst nicht gegen dich selbst abstimmen.')
  }

  const eligibleIds = getEligibleIds()
  if (!eligibleIds.includes(initiatorId)) {
    throw new Error('Du kannst gerade nicht abstimmen.')
  }
  if (eligibleIds.length < MIN_ELIGIBLE_VOTERS) {
    throw new Error('Dafür sind zu wenige Spieler verbunden.')
  }

  const poll: Poll = {
    targetId,
    targetName,
    initiatorId,
    // Starting a vote counts as a yes — otherwise the initiator would have to
    // click twice for something they obviously want.
    votes: new Map([[initiatorId, true]]),
    expiresAt: Date.now() + VOTE_KICK_TTL_MS,
    timer: setTimeout(() => closePoll(lobbyCode, 'expired'), VOTE_KICK_TTL_MS),
    getEligibleIds,
    onChange
  }
  polls.set(lobbyCode, poll)

  const state = buildState(poll, eligibleIds)
  // A two-player vote is already decided by the initiator's own yes.
  if (state.approvedBy.length >= state.needed) {
    clearTimeout(poll.timer)
    polls.delete(lobbyCode)
    poll.onChange(null, 'passed')
    return state
  }

  poll.onChange(state, null)
  return state
}

/** Cast or change a vote. Throws with a client-facing message when refused. */
export function castVoteKickVote(lobbyCode: string, voterId: string, approve: boolean): void {
  const poll = polls.get(lobbyCode)
  if (!poll) {
    throw new Error('Es läuft keine Abstimmung.')
  }
  if (voterId === poll.targetId) {
    throw new Error('Du kannst nicht über deinen eigenen Rauswurf abstimmen.')
  }
  if (!poll.getEligibleIds().includes(voterId)) {
    throw new Error('Du kannst gerade nicht abstimmen.')
  }

  poll.votes.set(voterId, approve)
  evaluate(lobbyCode)
}

/**
 * Re-check an open vote after the roster changed (someone left, dropped out or
 * came back). Also cancels the vote outright if the target is already gone.
 */
export function refreshVoteKick(lobbyCode: string, targetStillPresent: boolean): void {
  const poll = polls.get(lobbyCode)
  if (!poll) return
  if (!targetStillPresent) {
    closePoll(lobbyCode, 'cancelled')
    return
  }
  evaluate(lobbyCode)
}

/** Drop an open vote without reporting a decision (lobby closed, game reset). */
export function cancelVoteKick(lobbyCode: string): void {
  closePoll(lobbyCode, 'cancelled')
}
