import type { Socket } from 'socket.io-client'
interface LobbyProps {
  socket?: Socket
}

export default function Lobby({}: LobbyProps) {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="max-w-3xl w-full p-8 screen-shell">
        <h1 className="hero-title">Football Lobby</h1>
        <p className="mt-4 text-white/80">Lobby UI placeholder — matchmaking and team selection will be added.</p>
      </div>
    </div>
  )
}
