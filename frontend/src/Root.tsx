import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import GamePortal from './pages/GamePortal'
import CypherGame from './pages/CypherGame'
import WerBinIchGame from './pages/WerBinIchGame'
import WavvelengthGame from './pages/WavvelengthGame'
import MarketStandGame from './pages/MarketStandGame'

export default function Root() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<GamePortal />} />
        <Route path="/cypher/*" element={<CypherGame />} />
        <Route path="/werbinich/*" element={<WerBinIchGame />} />
        <Route path="/wavelength/*" element={<WavvelengthGame />} />
        <Route path="/wavvelength/*" element={<WavvelengthGame />} />
        <Route path="/marketstand" element={<MarketStandGame />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  )
}
