const { CONSTANTS, resetPlayerForRound } = require('./gameState');

// ─── CHECK ROUND END CONDITIONS ───────────────────────────────────────────────
// Called after all damage is applied each blink.
// Returns a result object if the round is over, or null if it continues.
function checkRoundEnd(p1, p2, isSubCollision, timeLeft) {

  // Sub vs sub collision → instant draw
  if (isSubCollision) {
    return { over: true, winner: null, cause: 'collision_draw' };
  }

  // Check if either sub took weapon damage this blink
  const p1Dead = p1.hp <= 0;
  const p2Dead = p2.hp <= 0;

  if (p1Dead && p2Dead) {
    // Both hit simultaneously — higher HP wins, equal HP = replay round
    if (p1.hp === p2.hp) {
      return { over: true, winner: null, cause: 'simultaneous_equal_hp' };
    }
    const winner = p1.hp > p2.hp ? 'p1' : 'p2';
    return { over: true, winner, cause: 'simultaneous_hit' };
  }

  if (p1Dead) {
    return { over: true, winner: 'p2', cause: 'torpedo_or_mine' };
  }

  if (p2Dead) {
    return { over: true, winner: 'p1', cause: 'torpedo_or_mine' };
  }

  // Timer expired → higher HP wins
  if (timeLeft <= 0) {
    if (p1.hp > p2.hp) return { over: true, winner: 'p1', cause: 'timer' };
    if (p2.hp > p1.hp) return { over: true, winner: 'p2', cause: 'timer' };
    return { over: true, winner: null, cause: 'timer_draw' };
  }

  return null; // round continues
}

// ─── APPLY ROUND RESULT ───────────────────────────────────────────────────────
// Updates the match score based on the round result.
function applyRoundResult(matchState, result) {
  if (result.winner === 'p1') {
    matchState.roundScores.p1++;
  } else if (result.winner === 'p2') {
    matchState.roundScores.p2++;
  } else {
    matchState.roundScores.draws++;
  }
  return matchState;
}

// ─── CHECK MATCH END ─────────────────────────────────────────────────────────
// Returns the match winner if someone has won 2 rounds, or null if match continues.
function checkMatchEnd(roundScores, currentRound) {
  if (roundScores.p1 >= 2) return { winner: 'p1' };
  if (roundScores.p2 >= 2) return { winner: 'p2' };

  // After round 3 with no winner — it's a draw
  if (currentRound >= 3) {
    return { winner: null, draw: true };
  }

  return null; // match continues
}

// ─── PREPARE NEXT ROUND ──────────────────────────────────────────────────────
// Resets positions and HP. Ammo carries over.
function prepareNextRound(matchState) {
  matchState.round++;
  matchState.blink  = 0;
  matchState.phase  = 'between_rounds';

  // Clear projectiles from previous round
  matchState.torpedoes = [];
  matchState.mines     = [];
  matchState.hitLog    = [];

  // Reset position + HP only (ammo is preserved on the player objects)
  resetPlayerForRound(matchState.players.p1);
  resetPlayerForRound(matchState.players.p2);

  return matchState;
}

module.exports = {
  checkRoundEnd,
  applyRoundResult,
  checkMatchEnd,
  prepareNextRound,
};