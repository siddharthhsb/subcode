import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function MatchHistory() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [matches, setMatches] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    if (user) {
      fetchMatchHistory(currentPage);
    }
  }, [user, currentPage]);

  async function fetchMatchHistory(page = 1) {
    try {
      const response = await fetch(`/api/matches?page=${page}&limit=20`);
      if (!response.ok) throw new Error('Failed to fetch match history');
      const data = await response.json();
      setMatches(data.matches);
      setPagination(data.pagination);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function getResultColor(result) {
    switch (result) {
      case 'win': return '#00FF9F';
      case 'loss': return '#FF4444';
      case 'draw': return '#FFB800';
      default: return '#FFFFFF';
    }
  }

  function formatEloChange(change) {
    if (change > 0) return `+${change}`;
    if (change < 0) return change.toString();
    return '0';
  }

  if (!user) {
    return (
      <div style={{
        minHeight: '100vh',
        backgroundColor: '#060C10',
        color: '#FFFFFF',
        fontFamily: 'JetBrains Mono, monospace',
        padding: '40px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        Please log in to view your match history.
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh',
        backgroundColor: '#060C10',
        color: '#FFFFFF',
        fontFamily: 'JetBrains Mono, monospace',
        padding: '40px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        Loading match history...
      </div>
    );
  }

  if (error) {
    return (
      <div style={{
        minHeight: '100vh',
        backgroundColor: '#060C10',
        color: '#FFFFFF',
        fontFamily: 'JetBrains Mono, monospace',
        padding: '40px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <div style={{ color: '#FF4444', marginBottom: '20px' }}>
          Error: {error}
        </div>
        <button
          onClick={() => fetchMatchHistory(currentPage)}
          style={{
            backgroundColor: '#00FF9F',
            color: '#060C10',
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
      backgroundColor: '#060C10',
      color: '#FFFFFF',
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
          color: '#00FF9F',
          margin: 0,
          fontSize: '2.5rem',
        }}>
          MATCH HISTORY
        </h1>
        <button
          onClick={() => navigate('/menu')}
          style={{
            backgroundColor: '#040910',
            color: '#FFFFFF',
            border: '1px solid #0d2a1a',
            padding: '10px 20px',
            borderRadius: '4px',
            cursor: 'pointer',
            fontFamily: 'JetBrains Mono, monospace',
          }}
        >
          ← Back to Menu
        </button>
      </div>

      {/* Match History Table */}
      <div style={{
        backgroundColor: '#040910',
        border: '1px solid #0d2a1a',
        borderRadius: '8px',
        overflow: 'hidden',
      }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: '150px 1fr 100px 100px 120px',
          gap: '0',
          backgroundColor: '#0d2a1a',
          padding: '15px',
          fontWeight: 'bold',
        }}>
          <div>DATE</div>
          <div>OPPONENT</div>
          <div>RESULT</div>
          <div>ELO ±</div>
          <div>ACTIONS</div>
        </div>

        {matches.map((match, index) => (
          <div
            key={match.id}
            style={{
              display: 'grid',
              gridTemplateColumns: '150px 1fr 100px 100px 120px',
              gap: '0',
              padding: '15px',
              borderBottom: index < matches.length - 1 ? '1px solid #0d2a1a' : 'none',
              backgroundColor: index % 2 === 0 ? 'transparent' : 'rgba(13, 42, 26, 0.1)',
            }}
          >
            <div style={{ color: '#FFFFFF', opacity: 0.8 }}>
              {new Date(match.date).toLocaleDateString()}
            </div>
            <div style={{ fontWeight: 'bold' }}>
              {match.opponent}
            </div>
            <div style={{
              fontWeight: 'bold',
              color: getResultColor(match.result),
              textTransform: 'uppercase',
            }}>
              {match.result}
            </div>
            <div style={{
              fontWeight: 'bold',
              color: match.eloChange > 0 ? '#00FF9F' : match.eloChange < 0 ? '#FF4444' : '#FFB800',
            }}>
              {formatEloChange(match.eloChange)}
            </div>
            <div>
              <button
                onClick={() => navigate(`/replay/${match.id}`)}
                style={{
                  backgroundColor: '#00FF9F',
                  color: '#060C10',
                  border: 'none',
                  padding: '8px 16px',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontFamily: 'JetBrains Mono, monospace',
                  fontSize: '0.9rem',
                  fontWeight: 'bold',
                }}
              >
                WATCH
              </button>
            </div>
          </div>
        ))}

        {matches.length === 0 && (
          <div style={{
            padding: '40px',
            textAlign: 'center',
            color: '#FFFFFF',
            opacity: 0.7,
          }}>
            No matches played yet. Start your first match to see your history here!
          </div>
        )}
      </div>

      {/* Pagination */}
      {pagination && pagination.pages > 1 && (
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          gap: '10px',
          marginTop: '30px',
        }}>
          <button
            onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
            disabled={currentPage === 1}
            style={{
              backgroundColor: currentPage === 1 ? '#0d2a1a' : '#040910',
              color: currentPage === 1 ? '#FFFFFF' : '#00FF9F',
              border: '1px solid #0d2a1a',
              padding: '10px 15px',
              borderRadius: '4px',
              cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
              fontFamily: 'JetBrains Mono, monospace',
            }}
          >
            ← Previous
          </button>

          <span style={{ color: '#FFFFFF', margin: '0 20px' }}>
            Page {pagination.page} of {pagination.pages}
          </span>

          <button
            onClick={() => setCurrentPage(prev => Math.min(pagination.pages, prev + 1))}
            disabled={currentPage === pagination.pages}
            style={{
              backgroundColor: currentPage === pagination.pages ? '#0d2a1a' : '#040910',
              color: currentPage === pagination.pages ? '#FFFFFF' : '#00FF9F',
              border: '1px solid #0d2a1a',
              padding: '10px 15px',
              borderRadius: '4px',
              cursor: currentPage === pagination.pages ? 'not-allowed' : 'pointer',
              fontFamily: 'JetBrains Mono, monospace',
            }}
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}
