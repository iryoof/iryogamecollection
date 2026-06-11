import { Link } from 'react-router-dom'

export default function MainMenu() {
  return (
    <div className="flex flex-col items-center gap-6">
      <h2 className="text-3xl font-bold">Football Career</h2>
      <p className="text-white/70">Create or join a lobby to start a match.</p>
      <div className="flex gap-3">
        <Link to="/football/lobby" className="action-primary px-4 py-2 rounded">Create Lobby</Link>
        <Link to="/football/lobby" className="action-secondary px-4 py-2 rounded">Join Lobby</Link>
      </div>
    </div>
  )
}
