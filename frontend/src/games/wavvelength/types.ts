export type WavvelengthScreen = 'menu' | 'lobby' | 'voting' | 'game' | 'result'

export interface WavvelengthPlayer {
  id: string
  name: string
  isHost: boolean
  isDisconnected?: boolean
  reconnectDeadline?: number | null
}

export interface WavvelengthLobbyState {
  code: string
  state: 'waiting' | 'voting' | 'playing' | 'result'
  players: WavvelengthPlayer[]
}

export interface WavvelengthVoteOption {
  number: number
  votes: number
}

export interface QuestionAndAnswer {
  playerId: string
  playerName: string
  question: string
  answer: string
}

export interface WavvelengthGameState {
  state: 'voting' | 'playing' | 'result'
  players: WavvelengthPlayer[]
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

export interface WavvelengthAck {
  ok?: boolean
  code?: string
  targetNumber?: number
  error?: string
  session?: WavvelengthSession
}

export interface WavvelengthSession {
  playerId: string
  reconnectKey: string
  lobbyCode: string
  playerName: string
  reconnectDeadline: number | null
}

export interface WavvelengthRound {
  seekerId: string
  targetNumber: number
  questionsAndAnswers: QuestionAndAnswer[]
  seekerGuess: number
  isCorrect: boolean
}

export interface WavvelengthArchive {
  id: string
  lobbyCode: string
  date: string
  players: string[]
  rounds: WavvelengthRound[]
}
