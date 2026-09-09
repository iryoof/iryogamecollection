import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import GamePortal from './pages/GamePortal'
import CypherGame from './pages/CypherGame'
import WerBinIchGame from './pages/WerBinIchGame'
import WavelengthGame from './pages/WavelengthGame'
import SchwedenraetselGame from './pages/SchwedenraetselGame'
import PokemonQuizGame from './pages/PokemonQuizGame'

export default function Root() {
  return (
    <Router>
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
    </Router>
  )
}
