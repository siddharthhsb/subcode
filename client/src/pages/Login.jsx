import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';

const API = 'http://localhost:4000';

export default function Login() {
  const navigate = useNavigate();
  const { login }  = useAuth();

  const [form, setForm]     = useState({ username: '', password: '' });
  const [error, setError]   = useState('');
  const [loading, setLoading] = useState(false);

  function handleChange(e) {
    setForm({ ...form, [e.target.name]: e.target.value });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await axios.post(`${API}/api/auth/login`, form);
      login(res.data.user, res.data.token);
      navigate('/menu');
    } catch (err) {
      setError(err.response?.data?.error || 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={styles.container}>
      <div style={styles.card} className="card">

        {/* Header */}
        <div style={styles.header}>
          <span style={{ color: 'var(--teal)', fontWeight: 700 }}>SUB</span>
          <span style={{ fontWeight: 700 }}>CODE</span>
        </div>
        <h2 style={styles.title}>Welcome back</h2>
        <p style={styles.subtitle}>Log in to your account</p>

        {/* Form */}
        <form onSubmit={handleSubmit} style={styles.form}>
          <div style={styles.field}>
            <label style={styles.label}>Username</label>
            <input
              name="username"
              placeholder="your_username"
              value={form.username}
              onChange={handleChange}
              autoComplete="username"
            />
          </div>

          <div style={styles.field}>
            <label style={styles.label}>Password</label>
            <input
              name="password"
              type="password"
              placeholder="••••••••"
              value={form.password}
              onChange={handleChange}
              autoComplete="current-password"
            />
          </div>

          {error && <p className="error-msg">{error}</p>}

          <button
            type="submit"
            className="btn btn-teal"
            style={{ width: '100%', marginTop: '8px' }}
            disabled={loading}
          >
            {loading ? 'Logging in...' : 'Log In'}
          </button>
        </form>

        <p style={styles.switchText}>
          No account?{' '}
          <Link to="/register" style={{ color: 'var(--teal)' }}>
            Register here
          </Link>
        </p>
      </div>
    </div>
  );
}

const styles = {
  container: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px',
    backgroundColor: 'var(--bg-primary)',
  },
  card: {
    width: '100%',
    maxWidth: '400px',
  },
  header: {
    fontSize: '24px',
    marginBottom: '8px',
  },
  title: {
    fontSize: '20px',
    fontWeight: '500',
    marginBottom: '4px',
  },
  subtitle: {
    fontSize: '13px',
    color: 'var(--text-secondary)',
    marginBottom: '28px',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  field: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  label: {
    fontSize: '12px',
    color: 'var(--text-secondary)',
  },
  switchText: {
    textAlign: 'center',
    fontSize: '13px',
    color: 'var(--text-secondary)',
    marginTop: '24px',
  },
};