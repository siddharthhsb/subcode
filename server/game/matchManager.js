const { createMatchState } = require('../engine/gameState');

// ─── ACTIVE MATCHES ───────────────────────────────────────────────────────────
// Map of matchId → match object
// Each match object contains the game state + both player socket IDs
const activeMatches = new Map();

// Map of userId → matchId (to find a player's current match quickly)
const playerMatchMap = new Map();

// ─── CREATE MATCH ─────────────────────────────────────────────────────────────
function createMatch(player1, player2) {
  const matchId = generateMatchId();

  const matchState = createMatchState(
    player1.userId,
    player2.userId,
    player1.language,
    player2.language,
  );
  matchState.matchId = matchId;

  const match = {
    id:       matchId,
    state:    matchState,
    players: {
      p1: {
        userId:   player1.userId,
        username: player1.username,
        socketId: player1.socketId,
        language: player1.language,
        script:   player1.script || '',
      },
      p2: {
        userId:   player2.userId,
        username: player2.username,
        socketId: player2.socketId,
        language: player2.language,
        script:   player2.script || '',
      },
    },
    interval:    null,   // the setInterval handle for the blink loop
    timeLeft:    60,     // seconds remaining in current round
    betweenTimer: null,  // timer handle for between-round countdown
    rated:       player1.rated !== false,
    createdAt:   Date.now(),
  };

  // Set initial scripts on the game state
  matchState.players.p1.script = match.players.p1.script;
  matchState.players.p2.script = match.players.p2.script;

  activeMatches.set(matchId, match);
  playerMatchMap.set(player1.userId, matchId);
  playerMatchMap.set(player2.userId, matchId);

  return match;
}

// ─── GET MATCH ────────────────────────────────────────────────────────────────
function getMatch(matchId) {
  return activeMatches.get(matchId) || null;
}

function getMatchByUserId(userId) {
  const matchId = playerMatchMap.get(userId);
  if (!matchId) return null;
  return activeMatches.get(matchId) || null;
}

// ─── END MATCH ────────────────────────────────────────────────────────────────
function endMatch(matchId) {
  const match = activeMatches.get(matchId);
  if (!match) return;

  // Stop the blink loop
  if (match.interval)     clearInterval(match.interval);
  if (match.betweenTimer) clearTimeout(match.betweenTimer);

  // Remove from maps
  playerMatchMap.delete(match.players.p1.userId);
  playerMatchMap.delete(match.players.p2.userId);
  activeMatches.delete(matchId);
}

// ─── UPDATE PLAYER SCRIPT ────────────────────────────────────────────────────
// Called when a player saves new code mid-match.
// Queues the new script — applied at the next blink.
function updatePlayerScript(userId, newScript) {
  const match = getMatchByUserId(userId);
  if (!match) return false;

  const slot = match.players.p1.userId === userId ? 'p1' : 'p2';
  match.state.players[slot].pendingScript = newScript;
  match.players[slot].script = newScript;
  return true;
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────
function generateMatchId() {
  return 'match_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
}

function getActiveMatchCount() {
  return activeMatches.size;
}

module.exports = {
  createMatch,
  getMatch,
  getMatchByUserId,
  endMatch,
  updatePlayerScript,
  getActiveMatchCount,
};