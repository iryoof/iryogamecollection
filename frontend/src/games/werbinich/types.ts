export type WerBinIchScreen = 'menu' | 'lobby' | 'game'

export interface WerBinIchPlayer {
  id: string
  name: string
  isHost: boolean
  isDisconnected?: boolean
  reconnectDeadline?: number | null
}

export interface WerBinIchLobbyState {
  code: string
  state: 'waiting' | 'writing' | 'playing'
  players: WerBinIchPlayer[]
}

export interface WerBinIchOtherPlayer {
  id: string
  name: string
  word: string | null
  solved: boolean
  isDisconnected?: boolean
  reconnectDeadline?: number | null
}

export interface WerBinIchGameState {
  state: 'writing' | 'playing'
  others: WerBinIchOtherPlayer[]
  myWord: string | null
  myWordAuthor: string | null
  iSolved: boolean
  needsToWrite: boolean
  writeForPlayer: string | null
  writeForPlayerId: string | null
  allWordsWritten: boolean
  isHost: boolean
  players: WerBinIchPlayer[]
}

export interface WerBinIchAck {
  ok?: boolean
  code?: string
  word?: string
  authorName?: string
  error?: string
  session?: WerBinIchSession
}

export interface WerBinIchSession {
  playerId: string
  reconnectKey: string
  lobbyCode: string
  playerName: string
  reconnectDeadline: number | null
}
