import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

const TOPICS = [
  {
    title: 'The Grid',
    content: `The ocean is a 10 × 10 × 10 cube of cells.

X axis:  0 (West)    → 9 (East)
Y axis:  0 (North)   → 9 (South)
Z axis:  0 (Surface) → 9 (Seafloor)

Your submarine has a position: (x, y, z).
Z = 0 is the surface. Z = 9 is the seafloor.

Starting positions every round:
  Player 1 → (1, 1, 1)
  Player 2 → (8, 8, 8)`,
  },
  {
    title: 'The Sonar Blink',
    content: `Every 1 second, the game pulses sonar. This is called a blink.

Your code runs once per blink.
Each blink your code receives the current game state and returns one action.
Your sonar always detects enemies and mines within 3 units of your sub.

Sonar is automatic and passive — no action needed.`,
  },
  {
    title: 'Movement & Speed',
    content: `Your sub can move in any of 26 directions — including all diagonals.

Return a move action with dx, dy, dz (each -1, 0, or +1) and a speed:

  {"action":"move","dx":1,"dy":0,"dz":-1,"speed":"slow"}

Speed tiers:
  slow  — 1 unit per axis  — enemy detects you from 3 units (silent)
  fast  — 2 units per axis — enemy detects you from 4 units
  max   — 3 units per axis — enemy detects you from 5 units

Your own detection range is always 3 units.
Moving fast makes YOU louder, not your sonar better.`,
  },
  {
    title: 'Boundaries & OOB',
    content: `Safe play area: X: 0–9 and Y: 0–9. No walls — you can exit but take damage.

  -20 HP per blink while x < 0, x > 9, y < 0, or y > 9
  Damage does NOT stack if both X and Y are out of range
  Z is clamped at 0 and 9 — no damage from depth

Your state shows out_of_bounds: True so your code can react.`,
  },
  {
    title: 'Torpedoes',
    content: `You start each match with 6 torpedoes. They do NOT refill between rounds.

  {"action":"fire","target":{"x":8,"y":8,"z":8}}

  • Travels at 6 units per blink in a straight 3D line
  • Does NOT stop at target — keeps going until it hits or exits
  • Detonates on contact with enemy sub or any mine
  • Blast zone: 3×3×3 cube = 27 cells = 50 HP damage

If the blast catches a mine, that mine also explodes — chain reactions.`,
  },
  {
    title: 'Mines',
    content: `You start each match with 6 mines. They do NOT refill between rounds.

  {"action":"mine","target_depth":5}

  • Deployed at your current (x, y)
  • Moves toward target_depth at 1 unit per blink
  • ACTIVE IMMEDIATELY — can detonate while sinking
  • Settles at target depth and waits
  • Blast zone: 3×3×3 cube = 50 HP damage
  • FRIENDLY FIRE IS ON — your own mines can kill you

Track your deployed mines via state["my_mines"].`,
  },
  {
    title: 'Blast Zone',
    content: `Both torpedoes and mines use the same blast zone:

  Center cell + all 26 adjacent cells = 3×3×3 cube = 27 cells total
  Any cell where x, y, or z differs by at most 1 from detonation point

A sub anywhere in that cube takes full 50 HP damage.
Two blasts from the same event stack — you can take 100 HP in one blink.`,
  },
  {
    title: 'Chain Reactions',
    content: `If a mine is inside a blast zone, it also detonates.

Resolution order:
  1. All direct detonations identified simultaneously
  2. Primary blasts resolve — each producing a 3×3×3 zone
  3. Any mines caught in blast zones added to queue
  4. Repeat until no new mines triggered
  5. All damage applied at the end

Large mine clusters can cause devastating chain reactions.
Be careful where you deploy — friendly fire is on.`,
  },
  {
    title: 'Collision Rules',
    content: `Special collision cases:

  Torpedo + torpedo (same cell, same blink)
    → Both detonate simultaneously — two separate 3×3×3 blasts

  Mine + mine (moving mine passes through another mine's cell)
    → Both detonate simultaneously

  Sub + sub (same cell, same blink)
    → Round ends as INSTANT DRAW — no damage, no blast

Strategic note: two subs approaching at max speed can
close 6 units in a single blink. At close range,
collision is a real risk.`,
  },
  {
    title: 'Round Rules',
    content: `A round ends when:
  • Any sub takes weapon damage (first hit ends round)
  • Two subs occupy same cell (instant draw)
  • 60-second timer runs out (higher HP wins)

Round winner:
  One sub hit, other not        → Unhit sub wins
  Timer runs out                → Higher HP wins
  Both hit simultaneously       → Higher HP wins (equal HP = round replays)
  Both subs collide             → Draw — no one scores

A drawn round does not count as a win for either player.`,
  },
  {
    title: 'Match Format',
    content: `Each match is best of 3 rounds.
First player to win 2 rounds wins the match.

Starting state every round:
  Player 1 → (1,1,1)   Player 2 → (8,8,8)
  Both players: 100 HP, full power
  Ammo carries over from previous rounds

Between rounds: 30-second break to edit your code.
New code runs from the start of the next round.`,
  },
  {
    title: 'Code Crash',
    content: `If your bot throws a runtime error during a blink:

  1. Sub loses power immediately
  2. Every blink: forced dz = +1 (sinks toward seafloor)
  3. Sub cannot move, fire, or deploy mines
  4. Editor shows: error type, message, line number
  5. Fix and save your code to restore power next blink
  6. Sub remains vulnerable while powerless

Execution timeout: 50ms per blink.
Exceeding the timeout defaults to idle action.`,
  },
  {
    title: 'Ammo Rules',
    content: `IMPORTANT: Ammo is per MATCH, not per round.

  6 torpedoes + 6 mines for the entire match.
  They do NOT refill when a new round starts.
  If you use all torpedoes in round 1, you have none in rounds 2 and 3.

Budget your weapons carefully.
A torpedo fired at round 1 blink 1 is gone forever.

Track remaining ammo:
  state["self"]["torpedoes"]  — torpedoes left
  state["self"]["mines"]      — mines left`,
  },
];

export default function HowToPlay() {
  const navigate    = useNavigate();
  const [open, setOpen] = useState(null);

  return (
    <div style={S.root}>
      <div style={S.topBar}>
        <button className="btn btn-ghost"
          style={{ fontSize: 12, padding: '6px 14px' }}
          onClick={() => navigate('/menu')}>← Menu</button>
        <span style={S.title}>HOW TO PLAY</span>
        <span style={{ width: 80 }} />
      </div>

      <div style={S.content}>
        <p style={S.intro}>
          SubCode is a coding game — your bot does the fighting.
          Read these rules carefully. They are also available in the
          editor's reference panel during a match.
        </p>

        <div style={S.accordion}>
          {TOPICS.map((topic, i) => (
            <div key={i} style={S.item}>
              <button
                style={{
                  ...S.itemHeader,
                  color: open === i ? '#00FF9F' : 'var(--text-primary)',
                  borderBottom: open === i ? '1px solid #0d2a1a' : '1px solid transparent',
                }}
                onClick={() => setOpen(open === i ? null : i)}>
                <span style={S.itemNum}>{String(i + 1).padStart(2, '0')}</span>
                <span style={S.itemTitle}>{topic.title}</span>
                <span style={{ color: '#1a5c3a', fontSize: 12 }}>
                  {open === i ? '▼' : '▶'}
                </span>
              </button>
              {open === i && (
                <div style={S.itemBody}>
                  <pre style={S.itemContent}>{topic.content}</pre>
                </div>
              )}
            </div>
          ))}
        </div>
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
    padding: '24px 20px',
    maxWidth: 760,
    margin: '0 auto',
    width: '100%',
  },
  intro: {
    fontSize: 12,
    color: 'var(--text-muted)',
    lineHeight: 1.8,
    marginBottom: 24,
  },
  accordion: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  item: {
    background: '#040910',
    border: '1px solid #0d2a1a',
    borderRadius: 6,
    overflow: 'hidden',
  },
  itemHeader: {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '14px 16px',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    textAlign: 'left',
    fontFamily: 'JetBrains Mono, monospace',
    transition: 'color 0.15s',
  },
  itemNum: {
    fontSize: 10,
    color: '#1a5c3a',
    minWidth: 24,
  },
  itemTitle: {
    fontSize: 13,
    fontWeight: 'bold',
    flex: 1,
    letterSpacing: '0.5px',
  },
  itemBody: {
    padding: '16px 20px',
    background: '#060C10',
  },
  itemContent: {
    fontSize: 11,
    color: 'var(--text-secondary)',
    lineHeight: 1.9,
    whiteSpace: 'pre-wrap',
    fontFamily: 'JetBrains Mono, monospace',
    margin: 0,
  },
};
