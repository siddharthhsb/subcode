const { CONSTANTS } = require('./gameState');

// ─── RUN SONAR FOR ONE PLAYER ────────────────────────────────────────────────
// Returns the sonar_results array that gets passed into the bot's state.
// Detects the enemy sub and all mines within the detection radius.
//
// Detection is ASYMMETRIC:
//   - You always detect the enemy within 3 units (your fixed detection range)
//   - The enemy detects YOU based on YOUR noise radius (your speed last blink)
//
function getSonarResults(scanner, target, mines) {
  const results = [];

  // Check if enemy sub is within scanner's fixed 3-unit detection range
  const distToEnemy = euclidean(scanner.position, target.position);
  if (distToEnemy <= CONSTANTS.NOISE_RADIUS.slow) {  // always 3 units
    results.push({
      type: 'enemy_sub',
      x: target.position.x,
      y: target.position.y,
      z: target.position.z,
    });
  }

  // Check all mines within the scanner's 3-unit detection range
  for (const mine of mines) {
    const distToMine = euclidean(scanner.position, mine);
    if (distToMine <= CONSTANTS.NOISE_RADIUS.slow) {
      results.push({
        type:  'mine',
        x:     mine.x,
        y:     mine.y,
        z:     mine.z,
        owner: mine.owner,  // 'p1' or 'p2'
      });
    }
  }

  return results;
}

// ─── CHECK IF SCANNER CAN DETECT TARGET (used for enemy detection of you) ────
// Returns true if the target is detectable based on the target's noise radius.
// This is the asymmetric rule: YOUR speed determines if the enemy can hear YOU.
function canEnemyDetectYou(you, enemy) {
  const dist = euclidean(you.position, enemy.position);
  return dist <= you.noiseRadius;
}

// ─── EUCLIDEAN DISTANCE (3D) ─────────────────────────────────────────────────
function euclidean(a, b) {
  return Math.sqrt(
    Math.pow(a.x - b.x, 2) +
    Math.pow(a.y - b.y, 2) +
    Math.pow(a.z - b.z, 2)
  );
}

module.exports = { getSonarResults, canEnemyDetectYou, euclidean };