import { io, Socket } from 'socket.io-client'

let socketInstance: Socket | null = null

export function initializeSocket(url: string): Socket {
  if (socketInstance) return socketInstance

  socketInstance = io(url, {
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    // Unbegrenzt, frueher 5. Bei 1-5s Abstand gab der Client nach rund 25
    // Sekunden endgueltig auf - ein Kaltstart der Render-Instanz dauert aber
    // etwa 50. Danach verband sich niemand mehr, und der Server warf alle aus
    // der Lobby. reconnectionDelayMax deckelt den Abstand, es wird also nicht
    // dauerhaft im Sekundentakt gehaemmert.
    reconnectionAttempts: Infinity,
    transports: ['websocket', 'polling']
  })

  socketInstance.on('connect', () => {
    console.log('✅ Socket connected:', socketInstance?.id)
  })

  socketInstance.on('disconnect', () => {
    console.log('❌ Socket disconnected')
  })

  socketInstance.on('error', (error) => {
    console.error('🔴 Socket error:', error)
  })

  return socketInstance
}

export function getSocket(): Socket | null {
  return socketInstance
}

export function disconnectSocket(): void {
  if (socketInstance) {
    socketInstance.disconnect()
    socketInstance = null
  }
}
