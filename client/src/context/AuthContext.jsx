import { createContext, useContext, useState, useEffect } from 'react';

// Create the context — this is the "global container" for auth state
const AuthContext = createContext(null);

// This component wraps your whole app and provides auth state to every page
export function AuthProvider({ children }) {
  const [user, setUser]   = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);

  // When the app loads, check if there's a saved token in localStorage
  useEffect(() => {
    const savedToken = localStorage.getItem('subcode_token');
    const savedUser  = localStorage.getItem('subcode_user');
    if (savedToken && savedUser) {
      setToken(savedToken);
      setUser(JSON.parse(savedUser));
    }
    setLoading(false);
  }, []);

  // Called after a successful login or register
  function login(userData, jwtToken) {
    setUser(userData);
    setToken(jwtToken);
    localStorage.setItem('subcode_token', jwtToken);
    localStorage.setItem('subcode_user', JSON.stringify(userData));
  }

  // Called when the player logs out
  function logout() {
    setUser(null);
    setToken(null);
    localStorage.removeItem('subcode_token');
    localStorage.removeItem('subcode_user');
  }

  return (
    <AuthContext.Provider value={{ user, token, login, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

// Custom hook — any page can call useAuth() to get the current user
export function useAuth() {
  return useContext(AuthContext);
}
