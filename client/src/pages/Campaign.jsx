import { useNavigate } from 'react-router-dom';

export default function Campaign() {
  const navigate = useNavigate();

  const tutorialMissions = [
    'Basic Movement',
    'Sonar Detection',
    'Torpedo Basics',
    'Mine Deployment',
    'Defensive Tactics',
    'Offensive Strategies',
    'Advanced Maneuvers',
    'Master Challenge'
  ];

  const gauntletBots = [
    'PLANKTON',
    'MINNOW',
    'TUNA',
    'SHARK',
    'ORCA',
    'SQUID',
    'GIANT SQUID',
    'LEVIATHAN'
  ];

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
        marginBottom: '60px',
      }}>
        <div>
          <h1 style={{
            color: '#00FF9F',
            margin: '0 0 10px 0',
            fontSize: '4rem',
            fontWeight: 'bold',
            textShadow: '0 0 20px rgba(0, 255, 159, 0.3)',
          }}>
            CAMPAIGN
          </h1>
          <p style={{
            color: '#FFB800',
            margin: 0,
            fontSize: '1.5rem',
            opacity: 0.9,
          }}>
            Coming Soon
          </p>
        </div>
        <button
          onClick={() => navigate('/menu')}
          style={{
            backgroundColor: '#040910',
            color: '#FFFFFF',
            border: '1px solid #0d2a1a',
            padding: '15px 25px',
            borderRadius: '4px',
            cursor: 'pointer',
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: '1rem',
          }}
        >
          ← Back to Menu
        </button>
      </div>

      {/* Campaign Sections */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))',
        gap: '40px',
        marginBottom: '60px',
      }}>
        {/* Tutorial Phase */}
        <div style={{
          backgroundColor: '#040910',
          border: '2px solid #0d2a1a',
          borderRadius: '12px',
          padding: '30px',
          position: 'relative',
          opacity: 0.7,
        }}>
          {/* Lock Icon */}
          <div style={{
            position: 'absolute',
            top: '20px',
            right: '20px',
            width: '40px',
            height: '40px',
            backgroundColor: '#FF4444',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '20px',
            fontWeight: 'bold',
          }}>
            🔒
          </div>

          <h2 style={{
            color: '#00FF9F',
            margin: '0 0 20px 0',
            fontSize: '2rem',
            borderBottom: '2px solid #0d2a1a',
            paddingBottom: '10px',
          }}>
            TUTORIAL PHASE
          </h2>

          <p style={{
            color: '#FFFFFF',
            margin: '0 0 25px 0',
            opacity: 0.8,
            fontSize: '1.1rem',
          }}>
            Learn the fundamentals of submarine warfare through 8 progressive missions
          </p>

          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '10px',
          }}>
            {tutorialMissions.map((mission, index) => (
              <div
                key={mission}
                style={{
                  backgroundColor: '#0d2a1a',
                  padding: '12px 15px',
                  borderRadius: '6px',
                  fontSize: '0.9rem',
                  color: '#FFFFFF',
                  opacity: 0.6,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                }}
              >
                <span style={{
                  color: '#FFB800',
                  fontWeight: 'bold',
                  minWidth: '20px',
                }}>
                  {index + 1}.
                </span>
                {mission}
              </div>
            ))}
          </div>
        </div>

        {/* Bot Gauntlet */}
        <div style={{
          backgroundColor: '#040910',
          border: '2px solid #0d2a1a',
          borderRadius: '12px',
          padding: '30px',
          position: 'relative',
          opacity: 0.7,
        }}>
          {/* Lock Icon */}
          <div style={{
            position: 'absolute',
            top: '20px',
            right: '20px',
            width: '40px',
            height: '40px',
            backgroundColor: '#FF4444',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '20px',
            fontWeight: 'bold',
          }}>
            🔒
          </div>

          <h2 style={{
            color: '#00FF9F',
            margin: '0 0 20px 0',
            fontSize: '2rem',
            borderBottom: '2px solid #0d2a1a',
            paddingBottom: '10px',
          }}>
            BOT GAUNTLET
          </h2>

          <p style={{
            color: '#FFFFFF',
            margin: '0 0 25px 0',
            opacity: 0.8,
            fontSize: '1.1rem',
          }}>
            Face off against increasingly challenging AI opponents in ranked matches
          </p>

          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '10px',
          }}>
            {gauntletBots.map((bot, index) => (
              <div
                key={bot}
                style={{
                  backgroundColor: '#0d2a1a',
                  padding: '12px 15px',
                  borderRadius: '6px',
                  fontSize: '0.9rem',
                  color: '#FFFFFF',
                  opacity: 0.6,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                }}
              >
                <span style={{
                  color: '#FFB800',
                  fontWeight: 'bold',
                  minWidth: '20px',
                }}>
                  {index + 1}.
                </span>
                <span style={{
                  fontWeight: 'bold',
                  color: index >= 6 ? '#FF4444' : index >= 4 ? '#FFB800' : '#00FF9F',
                }}>
                  {bot}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Footer Message */}
      <div style={{
        textAlign: 'center',
        padding: '40px 0',
        borderTop: '1px solid #0d2a1a',
      }}>
        <p style={{
          color: '#FFFFFF',
          fontSize: '1.2rem',
          margin: '0 0 10px 0',
          opacity: 0.9,
        }}>
          🚧 Campaign mode is under development 🚧
        </p>
        <p style={{
          color: '#FFB800',
          fontSize: '1.1rem',
          margin: 0,
          opacity: 0.8,
        }}>
          Check back soon for the ultimate SubCode challenge!
        </p>
      </div>
    </div>
  );
}