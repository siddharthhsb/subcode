import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useEffect, useState } from 'react';
import { useSocket } from '../context/SocketContext';

export default function Menu() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { socket } = useSocket();
  const [incomingInvite, setIncomingInvite] = useState(null);

  useEffect(() => {
    if (!socket) return;
    socket.on('match_invite', (data) => {
      setIncomingInvite(data);
    });
    return () => { socket.off('match_invite'); };
  }, [socket]);

  function handleLogout() {
    logout();
    navigate('/');
  }

  const menuItems = [
    {
      label: 'Find Match',
      description: 'Ranked PvP — compete for ELO',
      color: 'var(--teal)',
      onClick: () => navigate('/match'),
    },
    {
      label: 'Play with a Friend',
      description: 'Invite by username — rated or unrated',
      color: 'var(--teal)',
      onClick: () => navigate('/match?mode=friend'),
    },
    {
      label: 'Code Editor',
      description: 'Write and save your bot scripts',
      color: 'var(--teal)',
      onClick: () => navigate('/editor'),
    },
    {
      label: 'How to Play',
      description: 'Complete game rules & mechanics',
      color: 'var(--teal)',
      onClick: () => navigate('/how-to-play'),
    },
    {
      label: 'Campaign',
      description: 'Tutorial + Bot Gauntlet',
      color: 'var(--teal)',
      onClick: () => navigate('/campaign'),
    },
    {
      label: 'Leaderboard',
      description: 'Global ELO rankings',
      color: 'var(--teal)',
      onClick: () => navigate('/leaderboard'),
    },
    {
      label: 'My Profile',
      description: `ELO ${user?.elo || 1000} · ${user?.language?.toUpperCase() || 'PYTHON'}`,
      color: 'var(--teal)',
      onClick: () => navigate(`/profile/${user?.username}`),
    },
  ];

  return (
    <div style={styles.container}>

      {/* Top bar */}
      <div style={styles.topBar}>
        <div style={styles.logo}>
          <span style={{ color: 'var(--teal)' }}>SUB</span>CODE
        </div>
        <div style={styles.topRight}>
          <span style={styles.username}>[ {user?.username} ]</span>
          <button className="btn btn-ghost" style={{ padding: '6px 16px', fontSize: '12px' }} onClick={handleLogout}>
            Log Out
          </button>
        </div>
      </div>

      {/* Menu grid */}
      <div style={styles.grid}>
        {menuItems.map((item) => (
          <button
            key={item.label}
            onClick={item.onClick}
            style={{ ...styles.menuCard, borderColor: 'var(--border)' }}
            onMouseEnter={e => {
              e.currentTarget.style.borderColor = item.color;
              e.currentTarget.style.background = 'var(--bg-tertiary)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.borderColor = 'var(--border)';
              e.currentTarget.style.background = 'var(--bg-secondary)';
            }}
          >
            <span style={{ ...styles.menuLabel, color: item.color }}>{item.label}</span>
            <span style={styles.menuDesc}>{item.description}</span>
          </button>
        ))}
      </div>

      {/* Bottom status */}
      <div style={styles.status}>
        <span style={{ color: 'var(--teal)' }}>●</span> Server online
      </div>

      {/* INCOMING INVITE POPUP */}
      {incomingInvite && (
        <div style={styles.modalOverlay}>
          <div style={styles.modalCard}>
            <h3 style={{ fontSize: '16px', marginBottom: '8px' }}>Match Invite</h3>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '4px' }}>
              <span style={{ color: 'var(--teal)' }}>{incomingInvite.from}</span> wants to play
            </p>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '24px' }}>
              {incomingInvite.rated ? 'Rated match' : 'Unrated match'}
            </p>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button className="btn btn-ghost" style={{ flex: 1 }}
                onClick={() => {
                  socket.emit('decline_invite', { from: incomingInvite.from });
                  setIncomingInvite(null);
                }}>
                Decline
              </button>
              <button className="btn btn-teal" style={{ flex: 1 }}
                onClick={() => {
                  socket.emit('accept_invite', {
                    from: incomingInvite.from,
                    rated: incomingInvite.rated,
                  });
                  setIncomingInvite(null);
                  navigate('/match');
                }}>
                Accept
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const styles = {
  container: {
    minHeight: '100vh',
    backgroundColor: 'var(--bg-primary)',
    display: 'flex',
    flexDirection: 'column',
    padding: '0 24px 40px',
  },
  topBar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '20px 0',
    borderBottom: '1px solid var(--border)',
    marginBottom: '48px',
  },
  logo: {
    fontSize: '20px',
    fontWeight: '700',
    letterSpacing: '-0.5px',
  },
  topRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
  },
  username: {
    fontSize: '13px',
    color: 'var(--text-secondary)',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
    gap: '16px',
    maxWidth: '900px',
    margin: '0 auto',
    width: '100%',
  },
  menuCard: {
    background: 'var(--bg-secondary)',
    border: '1px solid',
    borderRadius: '12px',
    padding: '28px 24px',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    cursor: 'pointer',
    textAlign: 'left',
    transition: 'border-color 0.15s, background 0.15s',
    fontFamily: 'JetBrains Mono, monospace',
  },
  menuLabel: {
    fontSize: '16px',
    fontWeight: '500',
  },
  menuDesc: {
    fontSize: '12px',
    color: 'var(--text-muted)',
  },
  status: {
    position: 'fixed',
    bottom: '20px',
    right: '24px',
    fontSize: '11px',
    color: 'var(--text-muted)',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  modalOverlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.7)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
  },
  modalCard: {
    background: 'var(--bg-secondary)',
    border: '1px solid var(--border)',
    borderRadius: '12px',
    padding: '32px',
    textAlign: 'center',
    maxWidth: '340px',
    width: '100%',
    fontFamily: 'JetBrains Mono, monospace',
  },
};
