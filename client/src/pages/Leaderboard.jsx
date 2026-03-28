import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import axios from 'axios';

const API = import.meta.env.VITE_API_URL || 'http://localhost:4000';

export default function Leaderboard() {
  const navigate = useNavigate();
  const { user, token } = useAuth();
  const [board, setBoard]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');

  useEffect(() => {
    async function load() {
      try {
        const res = await axios.get(`${API}/api/leaderboard`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setBoard(res.data.leaderboard);
      } catch (err) {
        setError('Failed to load leaderboard');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  return (
    <div style={S.root}>

      {/* TOP BAR */}
      <div style={S.topBar}>
        <button className="btn btn-ghost"
          style={{ fontSize: 12, padding: '6px 14px' }}
          onClick={() => navigate('/menu')}>
          ← Menu
        </button>
        <span style={S.title}>GLOBAL LEADERBOARD</span>
        <span style={{ width: 80 }} />
      </div>

      {/* TABLE */}
      <div style={S.content}>
        {loading && <p style={S.muted}>Loading...</p>}
        {error   && <p style={S.error}>{error}</p>}
        {!loading && !error && (
          <table style={S.table}>
            <thead>
              <tr>
                {['RANK','PLAYER','LANG','ELO','W','L','D','MATCHES'].map(h => (
                  <th key={h} style={S.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {board.map((p, i) => {
                const isMe = p.username === user?.username;
                return (
                  <tr key={p.user_id}
                    style={{
                      ...S.tr,
                      background: isMe ? 'rgba(0,255,159,0.07)' : i%2===0 ? '#060C10' : '#040910',
                      cursor: 'pointer',
                    }}
                    onClick={() => navigate(`/profile/${p.username}`)}>
                    <td style={S.td}>
                      <span style={{
                        color: p.rank==1 ? '#FFD700' : p.rank==2 ? '#C0C0C0' : p.rank==3 ? '#CD7F32' : 'var(--text-muted)',
                        fontWeight: p.rank <= 3 ? 'bold' : 'normal',
                      }}>
                        #{p.rank}
                      </span>
                    </td>
                    <td style={S.td}>
                      <span style={{ color: isMe ? '#00FF9F' : 'var(--text-primary)', fontWeight: isMe ? 'bold' : 'normal' }}>
                        {p.username}
                        {isMe && <span style={{ color: '#00FF9F', fontSize: 10, marginLeft: 6 }}>(you)</span>}
                      </span>
                    </td>
                    <td style={{ ...S.td, color: 'var(--text-muted)', fontSize: 11 }}>
                      {p.language?.toUpperCase() || 'PY'}
                    </td>
                    <td style={{ ...S.td, color: '#00FF9F', fontWeight: 'bold', fontSize: 15 }}>
                      {p.elo}
                    </td>
                    <td style={{ ...S.td, color: '#00FF9F' }}>{p.wins}</td>
                    <td style={{ ...S.td, color: '#FF4444' }}>{p.losses}</td>
                    <td style={{ ...S.td, color: 'var(--text-muted)' }}>{p.draws}</td>
                    <td style={{ ...S.td, color: 'var(--text-muted)' }}>{p.matches_played}</td>
                  </tr>
                );
              })}
              {board.length === 0 && (
                <tr>
                  <td colSpan={8} style={{ ...S.td, textAlign: 'center', color: 'var(--text-muted)', padding: 40 }}>
                    No players yet. Play a match to appear here.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

const S = {
  root: {
    minHeight: '100vh',
    backgroundColor: '#060C10',
    display: 'flex',
    flexDirection: 'column',
  },
  topBar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 20px',
    borderBottom: '1px solid #0d2a1a',
    background: '#040910',
    flexShrink: 0,
  },
  title: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#00FF9F',
    fontFamily: 'JetBrains Mono, monospace',
    letterSpacing: '2px',
  },
  content: {
    flex: 1,
    padding: '24px 20px',
    overflowX: 'auto',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontFamily: 'JetBrains Mono, monospace',
  },
  th: {
    padding: '10px 16px',
    textAlign: 'left',
    fontSize: 10,
    color: '#1a5c3a',
    letterSpacing: '2px',
    borderBottom: '1px solid #0d2a1a',
    background: '#040910',
    fontWeight: 'normal',
  },
  tr: {
    borderBottom: '1px solid #0d2a1a',
    transition: 'background 0.1s',
  },
  td: {
    padding: '12px 16px',
    fontSize: 13,
    color: 'var(--text-primary)',
  },
  muted: {
    color: 'var(--text-muted)',
    fontFamily: 'JetBrains Mono, monospace',
    fontSize: 13,
  },
  error: {
    color: '#FF4444',
    fontFamily: 'JetBrains Mono, monospace',
    fontSize: 13,
  },
};