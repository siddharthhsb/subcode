const { CONSTANTS } = require('./gameState');

// ─── APPLY MOVEMENT ───────────────────────────────────────────────────────────
// Takes a player and a move action, returns updated player.
// Handles speed tiers, Z clamping, out-of-bounds detection.
function applyMovement(player, action) {
  // Validate speed
  const speed = action.speed || 'slow';
  if (!CONSTANTS.SPEED_UNITS[speed]) {
    return player; // invalid speed = no movement
  }

  const units = CONSTANTS.SPEED_UNITS[speed];

  // Each axis delta must be -1, 0, or 1
  const dx = clampDelta(action.dx);
  const dy = clampDelta(action.dy);
  const dz = clampDelta(action.dz);

  // Must move in at least one direction
  if (dx === 0 && dy === 0 && dz === 0) {
    return player;
  }

  // Apply movement — each active axis moves by (delta × units)
  let newX = player.position.x + dx * units;
  let newY = player.position.y + dy * units;
  let newZ = player.position.z + dz * units;

  // Z is clamped — no damage, just stops at boundary
  newZ = Math.max(0, Math.min(CONSTANTS.GRID_SIZE - 1, newZ));

  // X and Y are NOT clamped — sub can go out of bounds (takes damage)
  player.position.x = newX;
  player.position.y = newY;
  player.position.z = newZ;

  // Update speed and noise radius
  player.speed      = speed;
  player.noiseRadius = CONSTANTS.NOISE_RADIUS[speed];

  // Check out of bounds (X and Y only)
  player.outOfBounds = isOutOfBounds(newX, newY);

  return player;
}

// ─── APPLY FORCED SINKING ────────────────────────────────────────────────────
// Called every blink when a sub has lost power (code crashed).
// Forces dz = +1, clamped at Z = 9.
function applySinking(player) {
  player.position.z = Math.min(CONSTANTS.GRID_SIZE - 1, player.position.z + 1);
  player.speed      = 'idle';
  player.noiseRadius = CONSTANTS.NOISE_RADIUS.idle;
  return player;
}

// ─── OUT OF BOUNDS CHECK ─────────────────────────────────────────────────────
function isOutOfBounds(x, y) {
  return x < 0 || x >= CONSTANTS.GRID_SIZE ||
         y < 0 || y >= CONSTANTS.GRID_SIZE;
}

// ─── APPLY OUT OF BOUNDS DAMAGE ──────────────────────────────────────────────
// -40 HP per blink (= -20 HP/sec at 2s/blink). Flat — no stacking.
function applyOobDamage(player) {
  if (player.outOfBounds) {
    player.hp = Math.max(0, player.hp - CONSTANTS.OOB_DAMAGE_PER_BLINK);
    if (player.hp <= 0) player.hitThisBlink = true;
  }
  return player;
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────
function clampDelta(val) {
  if (val > 0)  return 1;
  if (val < 0)  return -1;
  return 0;
}

module.exports = { applyMovement, applySinking, applyOobDamage, isOutOfBounds };