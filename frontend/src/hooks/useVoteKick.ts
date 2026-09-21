import { useCallback, useEffect, useState } from 'react'
import type { Socket } from 'socket.io-client'
import type { VoteKickResult, VoteKickState } from '../../../shared/types'

export interface VoteKickApi {
  vote: VoteKickState | null
  notice: string
  startVoteKick: (targetId: string) => void
  castVote: (approve: boolean) => void
  clearNotice: () => void
}

/**
 * Client side of the vote kick for Wer bin ich and Wavelength. Both games run
 * on the same Socket.IO instance without namespaces, so the event names carry
 * a per-game prefix ('lobby:' and 'wvl:') — see CLAUDE.md on the event naming.
 * Cypher has its own wiring inside useGameSocket.
 */
export function useVoteKick(
  socket: Socket | null,
  prefix: string,
  onError?: (message: string) => void
): VoteKickApi {
  const [vote, setVote] = useState<VoteKickState | null>(null)
  const [notice, setNotice] = useState('')

  useEffect(() => {
    if (!socket) return

    const handleState = (state: VoteKickState | null) => setVote(state)
    const handleResult = ({ targetName, outcome }: VoteKickResult) => {
      setVote(null)
      if (outcome === 'cancelled') return
      setNotice(
        outcome === 'passed'
          ? `${targetName} wurde per Abstimmung entfernt.`
          : `Die Abstimmung über ${targetName} ist gescheitert.`
      )
    }

    socket.on(`${prefix}votekick:state`, handleState)
    socket.on(`${prefix}votekick:result`, handleResult)

    return () => {
      socket.off(`${prefix}votekick:state`, handleState)
      socket.off(`${prefix}votekick:result`, handleResult)
    }
  }, [socket, prefix])

  const startVoteKick = useCallback((targetId: string) => {
    socket?.emit(`${prefix}votekick:start`, targetId, (response?: { error?: string }) => {
      if (response?.error) onError?.(response.error)
    })
  }, [socket, prefix, onError])

  const castVote = useCallback((approve: boolean) => {
    socket?.emit(`${prefix}votekick:vote`, approve, (response?: { error?: string }) => {
      if (response?.error) onError?.(response.error)
    })
  }, [socket, prefix, onError])

  const clearNotice = useCallback(() => setNotice(''), [])

  return { vote, notice, startVoteKick, castVote, clearNotice }
}
