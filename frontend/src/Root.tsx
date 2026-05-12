import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import GamePortal from './pages/GamePortal'
import CypherGame from './pages/CypherGame'
import ComingSoon from './pages/ComingSoon'

export default function Root() {
  return (
    <Router basename="/iryogamecollection">
      <Routes>
        <Route path="/" element={<GamePortal />} />
        <Route path="/cypher/*" element={<CypherGame />} />
        <Route path="/werbinich" element={<ComingSoon />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  )
}
