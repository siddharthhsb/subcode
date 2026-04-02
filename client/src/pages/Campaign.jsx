import { useNavigate } from 'react-router-dom';

export default function Campaign() {
  const navigate = useNavigate();

  const bots = ['PLANKTON', 'DRIFTER', 'HUNTER', 'STALKER',
                 'PHANTOM', 'VIPER', 'LEVIATHAN SR', 'LEVIATHAN'];

  return (
    <div style={S.root}>
      <div style={S.topBar}>
        <button className="btn btn-ghost"
          style={{ fontSize: 12, padding: '6px 14px' }}
          onClick={() => navigate('/menu')}>← Menu</button>
        <span style={S.title}>CAMPAIGN</span>
        <span style={{ width: 80 }} />
      </div>

      <div style={S.content}>
        <div style={S.comingSoon}>COMING SOON</div>
        <p style={S.sub}>
          Campaign mode is under development.<br />
          Check back in a future update.
        </p>

        <div style={S.grid}>

          {/* Tutorial Phase */}
          <div style={S.card}>
            <div style={S.lockIcon}>🔒</div>
            <div style={S.cardTitle}>TUTORIAL PHASE</div>
            <div style={S.cardSub}>8 missions</div>
            <div style={S.missionList}>
              {['Move and stay in bounds', 'Use sonar effectively',
                'Fire your first torpedo', 'Deploy a mine',
                'Dodge incoming torpedoes', 'Use speed strategically',
                'Chain reaction tactics', 'Full engagement drill'
              ].map((m, i) => (
                <div key={i} style={S.mission}>
                  <span style={S.missionNum}>{i + 1}.</span>
                  <span style={S.missionName}>{m}</span>
                  <span style={S.locked}>LOCKED</span>
                </div>
              ))}
            </div>
          </div>

          {/* Bot Gauntlet */}
          <div style={S.card}>
            <div style={S.lockIcon}>🔒</div>
            <div style={S.cardTitle}>BOT GAUNTLET</div>
            <div style={S.cardSub}>8 bots — increasing difficulty</div>
            <div style={S.missionList}>
              {bots.map((bot, i) => (
                <div key={i} style={S.mission}>
                  <span style={S.missionNum}>{i + 1}.</span>
                  <span style={{ ...S.missionName, color: i >= 6 ? '#FF4444' : i >= 4 ? '#FFB800' : '#1a5c3a' }}>
                    {bot}
                  </span>
                  <span style={S.locked}>LOCKED</span>
                </div>
              ))}
            </div>
          </div>

        </div>

        <p style={S.note}>
          Complete all tutorial missions to unlock the Bot Gauntlet.<br />
          Defeat LEVIATHAN to earn the exclusive cockpit skin.
        </p>
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
  topBar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 20px',
    borderBottom: '1px solid #0d2a1a',
    background: '#040910',
  },
  title: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#00FF9F',
    letterSpacing: '2px',
  },
  content: {
    flex: 1,
    padding: '40px 20px',
    maxWidth: 900,
    margin: '0 auto',
    width: '100%',
    textAlign: 'center',
  },
  comingSoon: {
    fontSize: 42,
    fontWeight: 'bold',
    color: '#00FF9F',
    letterSpacing: '6px',
    marginBottom: 12,
  },
  sub: {
    fontSize: 13,
    color: 'var(--text-muted)',
    marginBottom: 40,
    lineHeight: 1.8,
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 20,
    marginBottom: 32,
    textAlign: 'left',
  },
  card: {
    background: '#040910',
    border: '1px solid #0d2a1a',
    borderRadius: 8,
    padding: '20px 24px',
  },
  lockIcon: {
    fontSize: 24,
    marginBottom: 8,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#00FF9F',
    letterSpacing: '2px',
    marginBottom: 4,
  },
  cardSub: {
    fontSize: 11,
    color: 'var(--text-muted)',
    marginBottom: 16,
  },
  missionList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  mission: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '6px 0',
    borderBottom: '1px solid #0d2a1a',
  },
  missionNum: {
    fontSize: 10,
    color: '#1a5c3a',
    minWidth: 16,
  },
  missionName: {
    fontSize: 11,
    color: '#1a5c3a',
    flex: 1,
  },
  locked: {
    fontSize: 9,
    color: '#0d2a1a',
    letterSpacing: '1px',
    border: '1px solid #0d2a1a',
    padding: '2px 6px',
    borderRadius: 3,
  },
  note: {
    fontSize: 11,
    color: '#1a5c3a',
    lineHeight: 1.8,
  },
};
