import { Suspense, lazy } from 'react'
import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import GamePortal from './pages/GamePortal'

// Die Spiele werden nachgeladen statt mitgeliefert. Das Portal ist die erste
// Seite, die jeder sieht, und es soll nicht den Ballast aller fünf Spiele
// tragen — beim Schwedenrätsel ist das inzwischen ein fünfstelliger Wortpool,
// den nur braucht, wer das Rätsel auch öffnet.
const CypherGame = lazy(() => import('./pages/CypherGame'))
const WerBinIchGame = lazy(() => import('./pages/WerBinIchGame'))
const WavelengthGame = lazy(() => import('./pages/WavelengthGame'))
const SchwedenraetselGame = lazy(() => import('./pages/SchwedenraetselGame'))
const PokemonQuizGame = lazy(() => import('./pages/PokemonQuizGame'))

function Loading() {
  return (
    <div className="flex min-h-screen items-center justify-center text-white/60">
      <div className="space-y-4 text-center">
        <div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-white/10 border-t-white" />
        <p className="text-sm">Lade …</p>
      </div>
    </div>
  )
}

export default function Root() {
  return (
    <Router>
      <Suspense fallback={<Loading />}>
        <Routes>
          <Route path="/" element={<GamePortal />} />
          <Route path="/cypher/*" element={<CypherGame />} />
          <Route path="/werbinich/*" element={<WerBinIchGame />} />
          <Route path="/wavelength/*" element={<WavelengthGame />} />
          <Route path="/schwedenraetsel/*" element={<SchwedenraetselGame />} />
          <Route path="/pokemonquiz/*" element={<PokemonQuizGame />} />
          {/* Legacy misspelled path, kept so older links keep working. */}
          <Route path="/wavvelength/*" element={<Navigate to="/wavelength" replace />} />
          {/* The puzzle used to be a numbered crossword and lived here. */}
          <Route path="/kreuzwortraetsel/*" element={<Navigate to="/schwedenraetsel" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </Router>
  )
}
