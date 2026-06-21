import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Login          from './pages/Login'
import Register       from './pages/Register'
import SanctionsCheck from './pages/SanctionsCheck'
import Search         from './pages/Search'
import Graph          from './pages/Graph'
import Reports        from './pages/Reports'
import Watchlist      from './pages/Watchlist'    // NEW Week 5
import BulkUpload     from './pages/BulkUpload'   // NEW Week 5

function ProtectedRoute({ children }) {
  return localStorage.getItem('sg_token') ? children : <Navigate to="/login" replace />
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login"           element={<Login />} />
        <Route path="/register"        element={<Register />} />
        <Route path="/check"           element={<ProtectedRoute><SanctionsCheck /></ProtectedRoute>} />
        <Route path="/search"          element={<ProtectedRoute><Search /></ProtectedRoute>} />
        <Route path="/graph/:searchId" element={<ProtectedRoute><Graph /></ProtectedRoute>} />
        <Route path="/reports"         element={<ProtectedRoute><Reports /></ProtectedRoute>} />
        <Route path="/watchlist"       element={<ProtectedRoute><Watchlist /></ProtectedRoute>} />
        <Route path="/bulk"            element={<ProtectedRoute><BulkUpload /></ProtectedRoute>} />
        <Route path="*"                element={<Navigate to="/search" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
