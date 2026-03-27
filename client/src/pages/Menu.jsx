import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Menu() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();

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
      ready: false,
    },
    {
      label: 'Play with a Friend',
      description: 'Invite by username — rated or unrated',
      color: 'var(--teal)',
      onClick: () => navigate('/match?mode=friend'),
      ready: false,
    },
    {
      label: 'Code Editor',
      description: 'Write and save your bot scripts',
      color: 'var(--teal)',
      onClick: () => navigate('/editor'),
      ready: false,
    },
    {
      label: 'Campaign',
      description: 'Tutorial + Bot Gauntlet',
      color: 'var(--text-muted)',
      onClick: () => navigate('/campaign'),
      ready: false,
    },
    {
      label: 'Leaderboard',
      description: 'Global ELO rankings',
      color: 'var(--teal)',
      onClick: () => navigate('/leaderboard'),
      ready: true,
    },
    {
      label: 'My Profile',
      description: `ELO ${user?.elo || 1000} · ${user?.language?.toUpperCase() || 'PYTHON'}`,
      color: 'var(--text-secondary)',
      onClick: () => navigate(`/profile/${user?.username}`),
      ready: false,
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
            style={{
              ...styles.menuCard,
              borderColor: 'var(--border)',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.borderColor = item.color;
              e.currentTarget.style.background = 'var(--bg-tertiary)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.borderColor = 'var(--border)';
              e.currentTarget.style.background = 'var(--bg-secondary)';
            }}
          >
            <span style={{ ...styles.menuLabel, color: item.color }}>
              {item.label}
            </span>
            <span style={styles.menuDesc}>{item.description}</span>
          </button>
        ))}
      </div>

      {/* Bottom status */}
      <div style={styles.status}>
        <span style={{ color: 'var(--teal)' }}>●</span> Server online
      </div>
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
};