import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useEffect } from 'react';

export default function Landing() {
  const navigate = useNavigate();
  const { user }  = useAuth();

  // If already logged in, skip landing and go straight to menu
  useEffect(() => {
    if (user) navigate('/menu');
  }, [user]);

  return (
    <div style={styles.container}>

      {/* Background grid effect */}
      <div style={styles.grid} />

      {/* Main content */}
      <div style={styles.content}>

        {/* Logo / Title */}
        <div style={styles.logoRow}>
          <span style={styles.logoTeal}>SUB</span>
          <span style={styles.logoWhite}>CODE</span>
        </div>

        <p style={styles.tagline}>
          Write code. Command your submarine. Destroy the enemy.
        </p>

        <p style={styles.subTagline}>
          A competitive multiplayer game where your bot does the fighting.
          <br />
          No reflexes required — just strategy, logic, and better code.
        </p>

        {/* Buttons */}
        <div style={styles.buttonRow}>
          <button
            className="btn btn-teal"
            style={{ fontSize: '16px', padding: '14px 40px' }}
            onClick={() => navigate('/register')}
          >
            Start Playing
          </button>
          <button
            className="btn btn-ghost"
            style={{ fontSize: '16px', padding: '14px 40px' }}
            onClick={() => navigate('/login')}
          >
            Log In
          </button>
        </div>

        {/* Feature tags */}
        <div style={styles.tags}>
          {['Python', 'C', 'Real-time PvP', 'ELO Ranked', 'Replay System'].map(tag => (
            <span key={tag} style={styles.tag}>{tag}</span>
          ))}
        </div>
      </div>

      {/* Bottom credit */}
      <div style={styles.footer}>
        CS50 Final Project
      </div>
    </div>
  );
}

const styles = {
  container: {
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    overflow: 'hidden',
    backgroundColor: 'var(--bg-primary)',
  },
  grid: {
    position: 'absolute',
    inset: 0,
    backgroundImage: `
      linear-gradient(var(--border) 1px, transparent 1px),
      linear-gradient(90deg, var(--border) 1px, transparent 1px)
    `,
    backgroundSize: '40px 40px',
    opacity: 0.4,
    pointerEvents: 'none',
  },
  content: {
    position: 'relative',
    zIndex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    textAlign: 'center',
    padding: '0 24px',
    maxWidth: '680px',
  },
  logoRow: {
    fontSize: '72px',
    fontWeight: '700',
    letterSpacing: '-2px',
    lineHeight: 1,
    marginBottom: '24px',
  },
  logoTeal: {
    color: 'var(--teal)',
  },
  logoWhite: {
    color: 'var(--text-primary)',
  },
  tagline: {
    fontSize: '20px',
    color: 'var(--text-primary)',
    fontWeight: '500',
    marginBottom: '16px',
  },
  subTagline: {
    fontSize: '14px',
    color: 'var(--text-secondary)',
    lineHeight: '1.8',
    marginBottom: '40px',
  },
  buttonRow: {
    display: 'flex',
    gap: '16px',
    marginBottom: '48px',
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  tags: {
    display: 'flex',
    gap: '10px',
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  tag: {
    padding: '4px 14px',
    borderRadius: '99px',
    border: '1px solid var(--border)',
    color: 'var(--text-secondary)',
    fontSize: '12px',
  },
  footer: {
    position: 'absolute',
    bottom: '24px',
    fontSize: '12px',
    color: 'var(--text-muted)',
  },
};