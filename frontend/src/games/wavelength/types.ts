export type WavelengthScreen = 'menu' | 'lobby' | 'voting' | 'game' | 'result'

export interface WavelengthPlayer {
  id: string
  name: string
  isHost: boolean
  isDisconnected?: boolean
  reconnectDeadline?: number | null
  /** Joined mid-round; sits this round out and is in from the next one. */
  isWaitingForNextRound?: boolean
}

export interface WavelengthLobbyState {
  code: string
  state: 'waiting' | 'voting' | 'playing' | 'result'
  players: WavelengthPlayer[]
  votedPlayerIds: string[]
}

export interface WavelengthVoteOption {
  number: number
  votes: number
}

export interface QuestionAndAnswer {
  playerId: string
  playerName: string
  question: string
  answer: string
}

export interface WavelengthGameState {
  state: 'voting' | 'playing' | 'result'
  players: WavelengthPlayer[]
  seekerId: string
  seekerName: string
  targetNumber: number
  targetNumberHidden: boolean // true for seeker, false for others
  questionsAndAnswers: QuestionAndAnswer[]
  seekerGuess?: number
  isCorrect?: boolean
  isHost: boolean
  myId: string
  myName: string
  hasAnsweredQuestion: boolean
  canAnswerQuestion: boolean
  pendingQuestion: string | null
  canMakeGuess: boolean
  isDisconnected?: boolean
  reconnectDeadline?: number | null
}

export interface WavelengthAck {
  ok?: boolean
  code?: string
  targetNumber?: number
  error?: string
  session?: WavelengthSession
}

export interface WavelengthSession {
  playerId: string
  reconnectKey: string
  lobbyCode: string
  playerName: string
  reconnectDeadline: number | null
}

export interface WavelengthRound {
  seekerId: string
  targetNumber: number
  questionsAndAnswers: QuestionAndAnswer[]
  seekerGuess: number
  isCorrect: boolean
}

export interface WavelengthArchive {
  id: string
  lobbyCode: string
  date: string
  players: string[]
  rounds: WavelengthRound[]
}
