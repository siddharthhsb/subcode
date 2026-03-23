import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';

const API = 'http://localhost:4000';

export default function Register() {
  const navigate  = useNavigate();
  const { login } = useAuth();

  const [form, setForm]       = useState({ username: '', email: '', password: '', language: 'python' });
  const [error, setError]     = useState('');
  const [loading, setLoading] = useState(false);

  function handleChange(e) {
    setForm({ ...form, [e.target.name]: e.target.value });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await axios.post(`${API}/api/auth/register`, form);
      login(res.data.user, res.data.token);
      navigate('/menu');
    } catch (err) {
      setError(err.response?.data?.error || 'Registration failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={styles.container}>
      <div style={styles.card} className="card">

        <div style={styles.header}>
          <span style={{ color: 'var(--teal)', fontWeight: 700 }}>SUB</span>
          <span style={{ fontWeight: 700 }}>CODE</span>
        </div>
        <h2 style={styles.title}>Create account</h2>
        <p style={styles.subtitle}>Choose your weapon of choice</p>

        <form onSubmit={handleSubmit} style={styles.form}>
          <div style={styles.field}>
            <label style={styles.label}>Username</label>
            <input
              name="username"
              placeholder="commander_name"
              value={form.username}
              onChange={handleChange}
            />
          </div>

          <div style={styles.field}>
            <label style={styles.label}>Email</label>
            <input
              name="email"
              type="email"
              placeholder="you@example.com"
              value={form.email}
              onChange={handleChange}
            />
          </div>

          <div style={styles.field}>
            <label style={styles.label}>Password</label>
            <input
              name="password"
              type="password"
              placeholder="min. 6 characters"
              value={form.password}
              onChange={handleChange}
            />
          </div>

          {/* Language selection */}
          <div style={styles.field}>
            <label style={styles.label}>Bot language</label>
            <div style={styles.langRow}>
              {['python', 'c'].map(lang => (
                <button
                  key={lang}
                  type="button"
                  onClick={() => setForm({ ...form, language: lang })}
                  style={{
                    ...styles.langBtn,
                    borderColor: form.language === lang ? 'var(--teal)' : 'var(--border)',
                    color:       form.language === lang ? 'var(--teal)' : 'var(--text-secondary)',
                    background:  form.language === lang ? 'rgba(29,158,117,0.1)' : 'transparent',
                  }}
                >
                  {lang === 'python' ? '🐍 Python' : '⚙️ C'}
                </button>
              ))}
            </div>
            <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
              You can change this later in your profile settings.
            </p>
          </div>

          {error && <p className="error-msg">{error}</p>}

          <button
            type="submit"
            className="btn btn-teal"
            style={{ width: '100%', marginTop: '8px' }}
            disabled={loading}
          >
            {loading ? 'Creating account...' : 'Create Account'}
          </button>
        </form>

        <p style={styles.switchText}>
          Already have an account?{' '}
          <Link to="/login" style={{ color: 'var(--teal)' }}>
            Log in
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
    maxWidth: '420px',
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
  langRow: {
    display: 'flex',
    gap: '10px',
  },
  langBtn: {
    flex: 1,
    padding: '10px',
    borderRadius: '6px',
    border: '1px solid',
    fontFamily: 'JetBrains Mono, monospace',
    fontSize: '13px',
    cursor: 'pointer',
    transition: 'all 0.15s',
  },
  switchText: {
    textAlign: 'center',
    fontSize: '13px',
    color: 'var(--text-secondary)',
    marginTop: '24px',
  },
};