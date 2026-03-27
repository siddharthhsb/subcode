// ─── GAME CONSTANTS ───────────────────────────────────────────────────────────
const CONSTANTS = {
  GRID_SIZE:              10,
  ROUND_DURATION:         60,    // seconds per round
  BETWEEN_ROUND_TIMEOUT:  30,    // seconds between rounds
  BLINK_INTERVAL:         1000,  // milliseconds (2 seconds per blink)
  TORPEDOES_PER_MATCH:    6,     // shared across all rounds
  MINES_PER_MATCH:        6,     // shared across all rounds
  STARTING_HP:            100,
  TORPEDO_SPEED:          6,     // units per blink
  MINE_SPEED:             1,     // units per blink (depth only)
  TORPEDO_DAMAGE:         50,
  MINE_DAMAGE:            50,
  OOB_DAMAGE_PER_BLINK:   20,    // -20 HP/sec = -40 HP per blink (2s)
  BLAST_RADIUS:           1,     // 3x3x3 cube = center ± 1
  NOISE_RADIUS: {
    slow: 3,
    fast: 4,
    max:  5,
    idle: 3,
  },
  SPEED_UNITS: {
    slow: 1,
    fast: 2,
    max:  3,
  },
  STARTING_POSITIONS: {
    p1: { x: 1, y: 1, z: 1 },
    p2: { x: 8, y: 8, z: 8 },
  },
};

// ─── CREATE FRESH MATCH STATE ─────────────────────────────────────────────────
// Called once when a match starts.
// Ammo is set here and carries across rounds — it never resets.
function createMatchState(player1Id, player2Id, player1Language, player2Language) {
  return {
    matchId:   null,
    round:     1,
    phase:     'playing',  // 'playing' | 'between_rounds' | 'finished'
    blink:     0,

    players: {
      p1: createPlayerState(player1Id, player1Language, 'p1'),
      p2: createPlayerState(player2Id, player2Language, 'p2'),
    },

    torpedoes:  [],   // active torpedoes in flight
    mines:      [],   // all deployed mines (active + settled)

    roundScores: {    // how many rounds each player has won
      p1: 0,
      p2: 0,
      draws: 0,
    },

    hitLog:    [],    // all damage events this round
    replayLog: [],    // full blink snapshots for replay
  };
}

// ─── CREATE FRESH PLAYER STATE ────────────────────────────────────────────────
function createPlayerState(userId, language, slot) {
  return {
    id:          userId,
    slot,                          // 'p1' or 'p2'
    language,                      // 'python' or 'c'
    position:    { ...CONSTANTS.STARTING_POSITIONS[slot] },
    hp:          CONSTANTS.STARTING_HP,
    torpedoes:   CONSTANTS.TORPEDOES_PER_MATCH,  // match-wide, never resets
    mines:       CONSTANTS.MINES_PER_MATCH,       // match-wide, never resets
    speed:       'idle',
    noiseRadius: CONSTANTS.NOISE_RADIUS.idle,
    outOfBounds: false,
    powered:     true,
    script:      null,             // the player's current bot code string
    pendingScript: null,           // queued code change, applied next blink
    lastError:   null,             // last runtime error { type, message, line }
  };
}

// ─── RESET PLAYER FOR NEW ROUND ───────────────────────────────────────────────
// Resets position and HP only. Ammo carries over — not reset.
function resetPlayerForRound(player) {
  player.position  = { ...CONSTANTS.STARTING_POSITIONS[player.slot] };
  player.hp        = CONSTANTS.STARTING_HP;
  player.speed     = 'idle';
  player.noiseRadius = CONSTANTS.NOISE_RADIUS.idle;
  player.outOfBounds = false;
  player.powered   = true;
  player.lastError = null;
  // torpedoes and mines are NOT reset — intentional
  return player;
}

module.exports = { CONSTANTS, createMatchState, createPlayerState, resetPlayerForRound };