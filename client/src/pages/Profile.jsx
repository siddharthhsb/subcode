import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import axios from 'axios';

const API = import.meta.env.VITE_API_URL || 'http://localhost:4000';

export default function Profile() {
  const { username }    = useParams();
  const navigate        = useNavigate();
  const { user, token } = useAuth();

  const [profile, setProfile]   = useState(null);
  const [matches, setMatches]   = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');

  const isMe = user?.username === username;

  useEffect(() => {
    async function load() {
      try {
        const [pRes, mRes] = await Promise.all([
          axios.get(`${API}/api/profile/${username}`, {
            headers: { Authorization: `Bearer ${token}` }
          }),
          isMe ? axios.get(`${API}/api/matches`, {
            headers: { Authorization: `Bearer ${token}` }
          }) : Promise.resolve({ data: { matches: [] } }),
        ]);
        setProfile(pRes.data.profile);
        setMatches(mRes.data.matches || []);
      } catch (err) {
        setError('Player not found');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [username]);

  if (loading) return <div style={S.center}><p style={S.muted}>Loading...</p></div>;
  if (error)   return (
    <div style={S.center}>
      <p style={S.error}>{error}</p>
      <button className="btn btn-ghost" onClick={() => navigate(-1)} style={{ marginTop: 16 }}>← Back</button>
    </div>
  );

  const winRate = profile.matches_played > 0
    ? ((profile.wins / profile.matches_played) * 100).toFixed(0)
    : 0;

  return (
    <div style={S.root}>

      {/* TOP BAR */}
      <div style={S.topBar}>
        <button className="btn btn-ghost"
          style={{ fontSize: 12, padding: '6px 14px' }}
          onClick={() => navigate(-1)}>← Back</button>
        <span style={S.pageTitle}>PLAYER PROFILE</span>
        <span style={{ width: 80 }} />
      </div>

      <div style={S.content}>

        {/* PROFILE CARD */}
        <div style={S.profileCard}>
          <div style={S.avatar}>
            {profile.username[0].toUpperCase()}
          </div>
          <div style={S.profileInfo}>
            <div style={S.playerName}>
              {profile.username}
              {isMe && <span style={S.youBadge}>YOU</span>}
            </div>
            <div style={S.playerMeta}>
              {profile.language?.toUpperCase() || 'PYTHON'} player
              · Joined {new Date(profile.created_at).toLocaleDateString()}
            </div>
          </div>
          <div style={S.eloBlock}>
            <div style={S.eloLabel}>ELO RATING</div>
            <div style={S.eloValue}>{profile.elo}</div>
          </div>
        </div>

        {/* STATS ROW */}
        <div style={S.statsRow}>
          {[
            { label: 'WINS',    value: profile.wins,            color: '#00FF9F' },
            { label: 'LOSSES',  value: profile.losses,          color: '#FF4444' },
            { label: 'DRAWS',   value: profile.draws,           color: 'var(--text-muted)' },
            { label: 'MATCHES', value: profile.matches_played,  color: 'var(--text-primary)' },
            { label: 'WIN RATE',value: `${winRate}%`,           color: winRate >= 50 ? '#00FF9F' : '#FFB800' },
          ].map(s => (
            <div key={s.label} style={S.statCard}>
              <div style={S.statLabel}>{s.label}</div>
              <div style={{ ...S.statValue, color: s.color }}>{s.value}</div>
            </div>
          ))}
        </div>

        {/* MATCH HISTORY (own profile only) */}
        {isMe && (
          <div style={S.historySection}>
            <div style={S.sectionTitle}>MATCH HISTORY</div>

            {matches.length === 0 ? (
              <p style={S.muted}>No matches played yet.</p>
            ) : (
              <table style={S.table}>
                <thead>
                  <tr>
                    {['DATE', 'OPPONENT', 'RESULT', 'SCORE', 'ELO CHANGE', 'MODE', 'REPLAY'].map(h => (
                      <th key={h} style={S.th}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {matches.map((m, i) => {
                    const isP1       = m.my_slot === 'p1';
                    const opponent   = isP1 ? m.p2_username : m.p1_username;
                    const myEloChange = isP1 ? m.player1_elo_change : m.player2_elo_change;
                    const didWin     = m.winner_id === null ? null
                      : (isP1 ? m.p1_username : m.p2_username) === profile.username
                      ? m.winner_id !== null : null;

                    // Determine result
                    let result, resultColor;
                    if (m.winner_id === null) {
                      result = 'DRAW'; resultColor = 'var(--text-muted)';
                    } else if (
                      (isP1 && m.p1_username === profile.username && m.winner_id !== null) ||
                      (!isP1 && m.p2_username === profile.username && m.winner_id !== null)
                    ) {
                      // Compare winner_id with profile id
                      result = 'WIN'; resultColor = '#00FF9F';
                    } else {
                      result = 'LOSS'; resultColor = '#FF4444';
                    }

                    // Simpler win check using elo change
                    if (myEloChange > 0) { result = 'WIN';  resultColor = '#00FF9F'; }
                    else if (myEloChange < 0) { result = 'LOSS'; resultColor = '#FF4444'; }
                    else if (myEloChange === 0 && m.winner_id === null) { result = 'DRAW'; resultColor = 'var(--text-muted)'; }

                    const eloColor = myEloChange > 0 ? '#00FF9F' : myEloChange < 0 ? '#FF4444' : 'var(--text-muted)';
                    const eloText  = myEloChange > 0 ? `+${myEloChange}` : myEloChange === 0 ? '±0' : `${myEloChange}`;

                    return (
                      <tr key={m.id}
                        style={{ background: i%2===0 ? '#060C10' : '#040910', borderBottom: '1px solid #0d2a1a' }}>
                        <td style={S.td}>
                          {new Date(m.created_at).toLocaleDateString()}
                        </td>
                        <td style={{ ...S.td, color: '#FFB800', cursor: 'pointer' }}
                          onClick={() => navigate(`/profile/${opponent}`)}>
                          {opponent}
                        </td>
                        <td style={{ ...S.td, color: resultColor, fontWeight: 'bold' }}>
                          {result}
                        </td>
                        <td style={S.td}>{m.final_score}</td>
                        <td style={{ ...S.td, color: eloColor, fontWeight: 'bold' }}>
                          {eloText}
                        </td>
                        <td style={{ ...S.td, color: 'var(--text-muted)', fontSize: 11 }}>
                          {m.mode}
                        </td>
                        <td style={S.td}>
                          <button
                            className="btn btn-ghost"
                            style={{ fontSize: 10, padding: '3px 10px' }}
                            onClick={() => navigate(`/replay/${m.id}`)}>
                            Watch
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
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
    fontFamily: 'JetBrains Mono, monospace',
  },
  center: {
    height: '100vh',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: 'JetBrains Mono, monospace',
  },
  topBar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 20px',
    borderBottom: '1px solid #0d2a1a',
    background: '#040910',
  },
  pageTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#00FF9F',
    letterSpacing: '2px',
  },
  content: {
    padding: '24px 20px',
    maxWidth: 900,
    margin: '0 auto',
    width: '100%',
  },
  profileCard: {
    display: 'flex',
    alignItems: 'center',
    gap: 20,
    background: '#040910',
    border: '1px solid #0d2a1a',
    borderRadius: 8,
    padding: '20px 24px',
    marginBottom: 16,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: '50%',
    background: 'rgba(0,255,159,0.1)',
    border: '2px solid #00FF9F',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 22,
    fontWeight: 'bold',
    color: '#00FF9F',
    flexShrink: 0,
  },
  profileInfo: {
    flex: 1,
  },
  playerName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: 'var(--text-primary)',
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    marginBottom: 4,
  },
  youBadge: {
    fontSize: 9,
    background: 'rgba(0,255,159,0.15)',
    border: '1px solid rgba(0,255,159,0.4)',
    color: '#00FF9F',
    padding: '2px 8px',
    borderRadius: 4,
    letterSpacing: '1px',
  },
  playerMeta: {
    fontSize: 11,
    color: 'var(--text-muted)',
  },
  eloBlock: {
    textAlign: 'right',
  },
  eloLabel: {
    fontSize: 9,
    color: '#1a5c3a',
    letterSpacing: '2px',
    marginBottom: 4,
  },
  eloValue: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#00FF9F',
  },
  statsRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(5, 1fr)',
    gap: 10,
    marginBottom: 24,
  },
  statCard: {
    background: '#040910',
    border: '1px solid #0d2a1a',
    borderRadius: 6,
    padding: '14px 12px',
    textAlign: 'center',
  },
  statLabel: {
    fontSize: 8,
    color: '#1a5c3a',
    letterSpacing: '2px',
    marginBottom: 6,
  },
  statValue: {
    fontSize: 22,
    fontWeight: 'bold',
  },
  historySection: {
    marginTop: 8,
  },
  sectionTitle: {
    fontSize: 10,
    color: '#1a5c3a',
    letterSpacing: '2px',
    marginBottom: 12,
    borderBottom: '1px solid #0d2a1a',
    paddingBottom: 8,
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
  },
  th: {
    padding: '8px 12px',
    textAlign: 'left',
    fontSize: 9,
    color: '#1a5c3a',
    letterSpacing: '2px',
    borderBottom: '1px solid #0d2a1a',
    background: '#040910',
    fontWeight: 'normal',
  },
  td: {
    padding: '10px 12px',
    fontSize: 12,
    color: 'var(--text-primary)',
  },
  muted: {
    color: 'var(--text-muted)',
    fontSize: 13,
  },
  error: {
    color: '#FF4444',
    fontSize: 13,
  },
};