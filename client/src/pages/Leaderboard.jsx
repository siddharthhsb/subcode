import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Leaderboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [leaderboard, setLeaderboard] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchLeaderboard();
  }, []);

  async function fetchLeaderboard() {
    try {
      const response = await fetch('/api/leaderboard');
      if (!response.ok) throw new Error('Failed to fetch leaderboard');
      const data = await response.json();
      setLeaderboard(data.leaderboard);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh',
        backgroundColor: 'var(--bg-primary)',
        color: 'var(--text-primary)',
        fontFamily: 'JetBrains Mono, monospace',
        padding: '40px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        Loading leaderboard...
      </div>
    );
  }

  if (error) {
    return (
      <div style={{
        minHeight: '100vh',
        backgroundColor: 'var(--bg-primary)',
        color: 'var(--text-primary)',
        fontFamily: 'JetBrains Mono, monospace',
        padding: '40px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <div style={{ color: 'var(--red)', marginBottom: '20px' }}>
          Error: {error}
        </div>
        <button
          onClick={fetchLeaderboard}
          style={{
            backgroundColor: 'var(--teal)',
            color: 'var(--bg-primary)',
            border: 'none',
            padding: '10px 20px',
            borderRadius: '4px',
            cursor: 'pointer',
            fontFamily: 'JetBrains Mono, monospace',
          }}
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: 'var(--bg-primary)',
      color: 'var(--text-primary)',
      fontFamily: 'JetBrains Mono, monospace',
      padding: '40px',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '40px',
      }}>
        <h1 style={{
          color: 'var(--teal)',
          margin: 0,
          fontSize: '2.5rem',
        }}>
          LEADERBOARD
        </h1>
        <button
          onClick={() => navigate('/menu')}
          style={{
            backgroundColor: 'var(--bg-secondary)',
            color: 'var(--text-primary)',
            border: '1px solid var(--border)',
            padding: '10px 20px',
            borderRadius: '4px',
            cursor: 'pointer',
            fontFamily: 'JetBrains Mono, monospace',
          }}
        >
          ← Back to Menu
        </button>
      </div>

      {/* Current User Highlight */}
      {user && (
        <div style={{
          backgroundColor: 'var(--bg-secondary)',
          border: '1px solid var(--border)',
          borderRadius: '8px',
          padding: '20px',
          marginBottom: '30px',
        }}>
          <h2 style={{ margin: '0 0 10px 0', color: 'var(--teal)' }}>
            Your Rank
          </h2>
          {(() => {
            const userEntry = leaderboard.find(p => p.username === user.username);
            if (userEntry) {
              return (
                <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
                  <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>
                    #{userEntry.rank}
                  </div>
                  <div>
                    <div style={{ fontSize: '1.2rem', fontWeight: 'bold' }}>
                      {userEntry.username}
                    </div>
                    <div style={{ color: 'var(--text-secondary)' }}>
                      {userEntry.elo} ELO • {userEntry.wins}W {userEntry.losses}L {userEntry.draws}D
                    </div>
                  </div>
                </div>
              );
            } else {
              return (
                <div style={{ color: 'var(--text-secondary)' }}>
                  You haven't played any ranked matches yet.
                </div>
              );
            }
          })()}
        </div>
      )}

      {/* Leaderboard Table */}
      <div style={{
        backgroundColor: 'var(--bg-secondary)',
        border: '1px solid var(--border)',
        borderRadius: '8px',
        overflow: 'hidden',
      }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: '80px 1fr 100px 120px 80px',
          gap: '0',
          backgroundColor: 'var(--bg-tertiary)',
          padding: '15px',
          fontWeight: 'bold',
          borderBottom: '1px solid var(--border)',
        }}>
          <div>RANK</div>
          <div>PLAYER</div>
          <div>ELO</div>
          <div>W/L/D</div>
          <div>MATCHES</div>
        </div>

        {leaderboard.map((player, index) => (
          <div
            key={player.username}
            style={{
              display: 'grid',
              gridTemplateColumns: '80px 1fr 100px 120px 80px',
              gap: '0',
              padding: '15px',
              borderBottom: index < leaderboard.length - 1 ? '1px solid var(--border)' : 'none',
              backgroundColor: player.username === user?.username ? 'rgba(0, 255, 159, 0.1)' : 'transparent',
            }}
          >
            <div style={{
              fontWeight: player.rank <= 3 ? 'bold' : 'normal',
              color: player.rank === 1 ? 'var(--gold)' :
                     player.rank === 2 ? 'var(--silver)' :
                     player.rank === 3 ? 'var(--bronze)' : 'var(--text-primary)',
            }}>
              #{player.rank}
            </div>
            <div style={{ fontWeight: 'bold' }}>
              {player.username}
            </div>
            <div style={{ fontWeight: 'bold', color: 'var(--teal)' }}>
              {player.elo}
            </div>
            <div style={{ color: 'var(--text-secondary)' }}>
              {player.wins}/{player.losses}/{player.draws}
            </div>
            <div style={{ color: 'var(--text-secondary)' }}>
              {player.matchesPlayed}
            </div>
          </div>
        ))}

        {leaderboard.length === 0 && (
          <div style={{
            padding: '40px',
            textAlign: 'center',
            color: 'var(--text-secondary)',
          }}>
            No players found. Be the first to play a ranked match!
          </div>
        )}
      </div>
    </div>
  );
}