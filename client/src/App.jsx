import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { SocketProvider } from './context/SocketContext';

import Landing  from './pages/Landing';
import Login    from './pages/Login';
import Register from './pages/Register';
import Menu     from './pages/Menu';
import Editor   from './pages/Editor';
import Match    from './pages/Match';
import Replay   from './pages/Replay';
import Leaderboard from './pages/Leaderboard';
import Profile from './pages/Profile';
import MatchHistory from './pages/MatchHistory';

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div style={{ color: 'var(--text-secondary)', padding: '40px' }}>Loading...</div>;
  if (!user)   return <Navigate to="/login" replace />;
  return children;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/"          element={<Landing />} />
      <Route path="/login"     element={<Login />} />
      <Route path="/register"  element={<Register />} />
      <Route path="/menu"      element={<ProtectedRoute><Menu /></ProtectedRoute>} />
      <Route path="/editor"    element={<ProtectedRoute><Editor /></ProtectedRoute>} />
      <Route path="/match"     element={<ProtectedRoute><Match /></ProtectedRoute>} />
      <Route path="/replay/:matchId" element={<ProtectedRoute><Replay /></ProtectedRoute>} />
      <Route path="/leaderboard" element={<ProtectedRoute><Leaderboard /></ProtectedRoute>} />
      <Route path="/profile/:username" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
      <Route path="/match-history" element={<ProtectedRoute><MatchHistory /></ProtectedRoute>} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <SocketProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </SocketProvider>
    </AuthProvider>
  );
}