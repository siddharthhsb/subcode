import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

export default function HowToPlay() {
  const navigate = useNavigate();
  const [expandedSection, setExpandedSection] = useState(null);

  const toggleSection = (index) => {
    setExpandedSection(expandedSection === index ? null : index);
  };

  const rules = [
    {
      title: "The Grid",
      content: "The battlefield is a 3D grid measuring 10×10×10 units. The X and Y axes represent horizontal movement, while Z represents depth (1 = surface, 10 = ocean floor). Player 1 starts at position (1,1,1) in the northwest surface corner. Player 2 starts at position (8,8,8) in the southeast deep corner."
    },
    {
      title: "The Sonar Blink",
      content: "Every second, both submarines perform a 'blink' - simultaneously executing their programmed actions. Each blink includes passive sonar detection that reveals enemy positions within 3 units of your submarine. Sonar results are only visible to the detecting player and update every blink."
    },
    {
      title: "Movement & Speed",
      content: "Submarines can move in 26 possible directions (all combinations of -1, 0, or +1 on X/Y/Z axes, excluding pure 0,0,0). Movement speed affects both distance traveled and sonar detection range: Slow (1 unit/blink, 3 unit sonar), Fast (2 units/blink, 4 unit sonar), Max (3 units/blink, 5 unit sonar)."
    },
    {
      title: "Boundaries",
      content: "The grid boundaries are enforced differently: X and Y axes are hard boundaries - going out of bounds costs 20 HP per blink until you return. The Z axis is clamped - you cannot go below 1 (surface) or above 10 (floor), but no damage is taken from Z boundary collisions."
    },
    {
      title: "Torpedoes",
      content: "Each submarine starts with 6 torpedoes per match (never refills between rounds). Torpedoes travel 6 units per blink in a straight line and explode on contact with anything, dealing 50 HP damage in a 3×3×3 blast zone. Torpedoes can be fired in any of the 26 directions."
    },
    {
      title: "Mines",
      content: "Each submarine starts with 6 mines per match (never refills between rounds). Mines are deployed at your current X/Y position and immediately sink to a target depth. They remain dormant until triggered by proximity to enemy submarines or explosions, then deal 50 HP damage in a 3×3×3 blast zone."
    },
    {
      title: "Blast Zone",
      content: "Both torpedoes and mines create identical 3×3×3 blast zones (27 total cells). The explosion affects all submarines, weapons, and mines within this cubic area. Blast zones can overlap, and damage is applied simultaneously to all affected entities."
    },
    {
      title: "Chain Reactions",
      content: "Mines within a blast zone will also detonate, creating their own blast zones. This can create chain reactions where one explosion triggers multiple mines. Chain reactions are resolved using breadth-first search to prevent infinite loops and ensure fair damage calculation."
    },
    {
      title: "Collision Rules",
      content: "Torpedo-torpedo collisions create dual 50 HP blasts in the same location. Submarine-submarine collisions result in an instant draw for that round. Submarines cannot occupy the same grid cell - the collision detection happens before movement is applied."
    },
    {
      title: "Round Rules",
      content: "Rounds end when a submarine reaches 0 HP or the 60-second timer expires. On timeout, the submarine with higher HP wins the round. If HP is equal, the round is a draw. Rounds are won by the first player to 2 round victories."
    },
    {
      title: "Match Format",
      content: "Matches are best-of-3 rounds. The first player to win 2 rounds wins the match. There are 30-second breaks between rounds for strategy adjustment. All ammunition is reset to 6 torpedoes and 6 mines at the start of each round."
    },
    {
      title: "Code Crash",
      content: "If your bot code crashes with a runtime error during a blink, your submarine loses power and begins forced sinking (moves toward the ocean floor). You must fix your code and redeploy to recover control. Crashed submarines cannot fire weapons or perform sonar."
    },
    {
      title: "Ammo Rules",
      content: "Each submarine has exactly 6 torpedoes and 6 mines per match. Ammunition never refills between rounds - if you use all your weapons in round 1, you have none remaining for rounds 2 and 3. Strategic ammo management is crucial for victory."
    }
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
        marginBottom: '40px',
      }}>
        <h1 style={{
          color: '#00FF9F',
          margin: 0,
          fontSize: '3rem',
          textShadow: '0 0 20px rgba(0, 255, 159, 0.3)',
        }}>
          HOW TO PLAY
        </h1>
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

      {/* Introduction */}
      <div style={{
        backgroundColor: '#040910',
        border: '1px solid #0d2a1a',
        borderRadius: '8px',
        padding: '30px',
        marginBottom: '30px',
      }}>
        <h2 style={{
          color: '#00FF9F',
          margin: '0 0 20px 0',
          fontSize: '1.5rem',
        }}>
          Welcome to SubCode
        </h2>
        <p style={{
          margin: 0,
          lineHeight: '1.6',
          color: '#FFFFFF',
          opacity: 0.9,
        }}>
          SubCode is a competitive programming game where you write AI bots to control submarines in tactical underwater combat.
          Master the rules below to become a submarine warfare expert. Each rule section can be expanded for detailed explanations.
        </p>
      </div>

      {/* Rules Accordion */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
      }}>
        {rules.map((rule, index) => (
          <div
            key={index}
            style={{
              backgroundColor: '#040910',
              border: '1px solid #0d2a1a',
              borderRadius: '8px',
              overflow: 'hidden',
            }}
          >
            {/* Accordion Header */}
            <button
              onClick={() => toggleSection(index)}
              style={{
                width: '100%',
                backgroundColor: 'transparent',
                border: 'none',
                padding: '20px',
                textAlign: 'left',
                cursor: 'pointer',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: '1.1rem',
                color: '#00FF9F',
                transition: 'background-color 0.2s',
              }}
              onMouseEnter={(e) => {
                e.target.style.backgroundColor = '#0d2a1a';
              }}
              onMouseLeave={(e) => {
                e.target.style.backgroundColor = 'transparent';
              }}
            >
              <span style={{ fontWeight: 'bold' }}>
                {index + 1}. {rule.title}
              </span>
              <span style={{
                fontSize: '1.2rem',
                transform: expandedSection === index ? 'rotate(45deg)' : 'rotate(0deg)',
                transition: 'transform 0.2s',
              }}>
                +
              </span>
            </button>

            {/* Accordion Content */}
            {expandedSection === index && (
              <div style={{
                padding: '0 20px 20px 20px',
                borderTop: '1px solid #0d2a1a',
                color: '#FFFFFF',
                opacity: 0.9,
                lineHeight: '1.6',
              }}>
                {rule.content}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Footer */}
      <div style={{
        textAlign: 'center',
        marginTop: '40px',
        padding: '30px',
        backgroundColor: '#040910',
        border: '1px solid #0d2a1a',
        borderRadius: '8px',
      }}>
        <p style={{
          margin: '0 0 10px 0',
          color: '#FFB800',
          fontSize: '1.2rem',
        }}>
          Ready to dive in?
        </p>
        <p style={{
          margin: 0,
          color: '#FFFFFF',
          opacity: 0.8,
        }}>
          Head back to the menu to start coding your first submarine AI!
        </p>
      </div>
    </div>
  );
}