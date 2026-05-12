import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import GamePortal from './pages/GamePortal'
import CypherGame from './pages/CypherGame'
import WerBinIchGame from './pages/WerBinIchGame'

export default function Root() {
  return (
    <Router basename="/iryogamecollection">
      <Routes>
        <Route path="/" element={<GamePortal />} />
        <Route path="/cypher/*" element={<CypherGame />} />
        <Route path="/werbinich/*" element={<WerBinIchGame />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  )
}
