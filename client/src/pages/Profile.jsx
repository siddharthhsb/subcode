import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Profile() {
  const { username } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchProfile();
  }, [username]);

  async function fetchProfile() {
    try {
      const response = await fetch(`/api/profile/${username}`);
      if (!response.ok) {
        if (response.status === 404) {
          throw new Error('User not found');
        }
        throw new Error('Failed to fetch profile');
      }
      const data = await response.json();
      setProfile(data.profile);
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
        backgroundColor: '#060C10',
        color: '#FFFFFF',
        fontFamily: 'JetBrains Mono, monospace',
        padding: '40px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        Loading profile...
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
          onClick={fetchProfile}
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

  const isOwnProfile = user && user.username === username;

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
          PROFILE: {profile.username.toUpperCase()}
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

      {/* Profile Stats */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
        gap: '20px',
        marginBottom: '40px',
      }}>
        {/* ELO Card */}
        <div style={{
          backgroundColor: '#040910',
          border: '1px solid #0d2a1a',
          borderRadius: '8px',
          padding: '30px',
          textAlign: 'center',
        }}>
          <div style={{
            fontSize: '3rem',
            fontWeight: 'bold',
            color: '#00FF9F',
            marginBottom: '10px',
          }}>
            {profile.elo}
          </div>
          <div style={{ color: '#FFFFFF', fontSize: '1.2rem' }}>
            ELO RATING
          </div>
        </div>

        {/* Win/Loss/Draw Card */}
        <div style={{
          backgroundColor: '#040910',
          border: '1px solid #0d2a1a',
          borderRadius: '8px',
          padding: '30px',
          textAlign: 'center',
        }}>
          <div style={{
            fontSize: '2rem',
            fontWeight: 'bold',
            marginBottom: '10px',
          }}>
            <span style={{ color: '#00FF9F' }}>{profile.wins}</span> /{' '}
            <span style={{ color: '#FF4444' }}>{profile.losses}</span> /{' '}
            <span style={{ color: '#FFB800' }}>{profile.draws}</span>
          </div>
          <div style={{ color: '#FFFFFF', fontSize: '1.2rem' }}>
            WINS / LOSSES / DRAWS
          </div>
        </div>

        {/* Matches Played Card */}
        <div style={{
          backgroundColor: '#040910',
          border: '1px solid #0d2a1a',
          borderRadius: '8px',
          padding: '30px',
          textAlign: 'center',
        }}>
          <div style={{
            fontSize: '3rem',
            fontWeight: 'bold',
            color: '#00FF9F',
            marginBottom: '10px',
          }}>
            {profile.matchesPlayed}
          </div>
          <div style={{ color: '#FFFFFF', fontSize: '1.2rem' }}>
            MATCHES PLAYED
          </div>
        </div>

        {/* Language Card */}
        <div style={{
          backgroundColor: '#040910',
          border: '1px solid #0d2a1a',
          borderRadius: '8px',
          padding: '30px',
          textAlign: 'center',
        }}>
          <div style={{
            fontSize: '2rem',
            fontWeight: 'bold',
            color: '#00FF9F',
            marginBottom: '10px',
            textTransform: 'uppercase',
          }}>
            {profile.language}
          </div>
          <div style={{ color: '#FFFFFF', fontSize: '1.2rem' }}>
            PREFERRED LANGUAGE
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div style={{
        display: 'flex',
        gap: '20px',
        justifyContent: 'center',
      }}>
        {isOwnProfile && (
          <button
            onClick={() => navigate('/match-history')}
            style={{
              backgroundColor: '#00FF9F',
              color: '#060C10',
              border: 'none',
              padding: '15px 30px',
              borderRadius: '4px',
              cursor: 'pointer',
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: '1.1rem',
              fontWeight: 'bold',
            }}
          >
            VIEW MATCH HISTORY
          </button>
        )}

        <button
          onClick={() => navigate('/leaderboard')}
          style={{
            backgroundColor: '#040910',
            color: '#FFFFFF',
            border: '1px solid #0d2a1a',
            padding: '15px 30px',
            borderRadius: '4px',
            cursor: 'pointer',
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: '1.1rem',
          }}
        >
          VIEW LEADERBOARD
        </button>
      </div>

      {/* Join Date */}
      <div style={{
        textAlign: 'center',
        marginTop: '40px',
        color: '#FFFFFF',
        opacity: 0.7,
      }}>
        Member since {new Date(profile.joinDate).toLocaleDateString()}
      </div>
    </div>
  );
}