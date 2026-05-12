export type WerBinIchScreen = 'menu' | 'lobby' | 'game'

export interface WerBinIchPlayer {
  id: string
  name: string
  isHost: boolean
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
}
