import { Link } from 'react-router-dom'

export default function ComingSoon() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-8">
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.09),transparent_30%),radial-gradient(circle_at_bottom_right,rgba(255,255,255,0.05),transparent_28%)]" />
      </div>

      <div className="relative z-10 text-center max-w-md">
        <div className="text-7xl mb-6">🚀</div>
        <h1 className="text-4xl font-bold mb-4 text-white">Coming Soon</h1>
        <p className="text-white/70 mb-8">
          Wer bin ich? wird in Kürze hier verfügbar sein!
        </p>
        <p className="text-white/50 mb-12 text-sm">
          In der Zwischenzeit kannst du Cypher spielen
        </p>
        <Link
          to="/"
          className="inline-block px-8 py-3 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white rounded-xl font-semibold transition-all hover:shadow-lg"
        >
          ← Zurück zum Portal
        </Link>
      </div>
    </div>
  )
}
