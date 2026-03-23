import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';

// Pages — we'll create these one by one
import Landing  from './pages/Landing';
import Login    from './pages/Login';
import Register from './pages/Register';
import Menu     from './pages/Menu';
import Editor   from './pages/Editor';

// Protected route — redirects to /login if the user isn't authenticated
function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div style={{ color: 'var(--text-secondary)', padding: '40px' }}>Loading...</div>;
  if (!user)   return <Navigate to="/login" replace />;
  return children;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/"         element={<Landing />} />
      <Route path="/login"    element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/menu"     element={<ProtectedRoute><Menu /></ProtectedRoute>} />
      <Route path="/editor"   element={<ProtectedRoute><Editor /></ProtectedRoute>} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  );
}