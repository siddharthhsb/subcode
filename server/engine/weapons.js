const { CONSTANTS } = require('./gameState');
const { euclidean } = require('./sonar');

// ─── FIRE TORPEDO ─────────────────────────────────────────────────────────────
// Creates a torpedo object. Returns null if player is out of ammo.
function fireTorpedo(player, action) {
  if (player.torpedoes <= 0) return null;

  const target = action.target;
  if (target.x === undefined || target.y === undefined || target.z === undefined) {
    return null; // invalid target
  }

  player.torpedoes--;

  // Calculate direction vector (normalised to unit steps)
  const dx = target.x - player.position.x;
  const dy = target.y - player.position.y;
  const dz = target.z - player.position.z;
  const dist = Math.sqrt(dx*dx + dy*dy + dz*dz);

  if (dist === 0) return null; // firing at your own position

  return {
    id:      generateId(),
    owner:   player.slot,
    x:       player.position.x,
    y:       player.position.y,
    z:       player.position.z,
    // Direction as a unit vector — torpedo moves 6 units/blink along this
    vx:      (dx / dist) * CONSTANTS.TORPEDO_SPEED,
    vy:      (dy / dist) * CONSTANTS.TORPEDO_SPEED,
    vz:      (dz / dist) * CONSTANTS.TORPEDO_SPEED,
    active:  true,
  };
}

// ─── DEPLOY MINE ──────────────────────────────────────────────────────────────
// Creates a mine object at player's current (x, y). Returns null if out of ammo.
function deployMine(player, action) {
  if (player.mines <= 0) return null;

  const targetDepth = Math.max(0, Math.min(CONSTANTS.GRID_SIZE - 1,
    parseInt(action.target_depth) || player.position.z));

  player.mines--;

  return {
    id:          generateId(),
    owner:       player.slot,
    x:           player.position.x,
    y:           player.position.y,
    z:           player.position.z,   // current depth
    targetDepth: targetDepth,
    settled:     player.position.z === targetDepth,
    active:      true,
  };
}

// ─── ADVANCE TORPEDOES ────────────────────────────────────────────────────────
// Moves all active torpedoes by their velocity vector.
// Marks torpedoes as inactive if they leave the grid.
function advanceTorpedoes(torpedoes) {
  for (const t of torpedoes) {
    if (!t.active) continue;
    t.x += t.vx;
    t.y += t.vy;
    t.z += t.vz;

    // Deactivate if outside the grid (generous bounds — 3 units outside)
    if (t.x < -3 || t.x > 12 || t.y < -3 || t.y > 12 ||
        t.z < -3 || t.z > 12) {
      t.active = false;
    }
  }
  return torpedoes;
}

// ─── ADVANCE MINES ────────────────────────────────────────────────────────────
// Moves unsettled mines toward their target depth by 1 unit/blink.
function advanceMines(mines) {
  for (const m of mines) {
    if (!m.active || m.settled) continue;
    if (m.z < m.targetDepth)      m.z++;
    else if (m.z > m.targetDepth) m.z--;

    if (m.z === m.targetDepth) m.settled = true;
  }
  return mines;
}

// ─── DETECT TORPEDO COLLISIONS ───────────────────────────────────────────────
// Checks if any torpedo has hit a sub or a mine.
// Returns a list of detonation events.
function detectTorpedoCollisions(torpedoes, p1, p2, mines) {
  const detonations = [];

  for (const t of torpedoes) {
    if (!t.active) continue;

    // Check torpedo vs enemy sub
    const enemySlot = t.owner === 'p1' ? 'p2' : 'p1';
    const enemy = enemySlot === 'p1' ? p1 : p2;

    if (positionsOverlap(t, enemy.position)) {
      detonations.push({ type: 'torpedo_hit_sub', torpedo: t, target: enemy });
      t.active = false;
      continue;
    }

    // Check torpedo vs mines
    for (const m of mines) {
      if (!m.active) continue;
      if (positionsOverlap(t, m)) {
        detonations.push({ type: 'torpedo_hit_mine', torpedo: t, mine: m });
        t.active = false;
        m.active = false;
        break;
      }
    }
  }

  // Check torpedo vs torpedo (same cell, same blink)
  const activeTorpedoes = torpedoes.filter(t => t.active);
  for (let i = 0; i < activeTorpedoes.length; i++) {
    for (let j = i + 1; j < activeTorpedoes.length; j++) {
      if (positionsOverlap(activeTorpedoes[i], activeTorpedoes[j])) {
        detonations.push({
          type: 'torpedo_vs_torpedo',
          t1: activeTorpedoes[i],
          t2: activeTorpedoes[j],
        });
        activeTorpedoes[i].active = false;
        activeTorpedoes[j].active = false;
      }
    }
  }

  return detonations;
}

// ─── DETECT MINE PROXIMITY TRIGGERS ──────────────────────────────────────────
// Checks if any sub has entered a mine's blast zone (3×3×3 cube = within 1 unit).
function detectMineProximityTriggers(mines, p1, p2) {
  const triggered = [];

  for (const m of mines) {
    if (!m.active) continue;

    for (const player of [p1, p2]) {
      if (isInBlastZone(player.position, m)) {
        triggered.push({ mine: m, target: player });
        m.active = false;
        break;
      }
    }
  }

  // Check mine vs mine collision (moving mine passes through another mine's cell)
  const activeMines = mines.filter(m => m.active);
  for (let i = 0; i < activeMines.length; i++) {
    for (let j = i + 1; j < activeMines.length; j++) {
      if (positionsOverlap(activeMines[i], activeMines[j])) {
        triggered.push({ mine: activeMines[i], target: null, chainMine: activeMines[j] });
        activeMines[i].active = false;
        activeMines[j].active = false;
      }
    }
  }

  return triggered;
}

// ─── RESOLVE BLAST + CHAIN REACTIONS ─────────────────────────────────────────
// Given a detonation point, resolves the 3×3×3 blast zone and chains.
// Uses BFS to process chain reactions.
// Returns total damage dealt to p1 and p2.
function resolveBlast(detonationPoint, p1, p2, mines) {
  const damage = { p1: 0, p2: 0 };
  const queue  = [detonationPoint];
  const blasted = new Set(); // prevent double-processing same mine

  while (queue.length > 0) {
    const center = queue.shift();

    // Check if each player is in this blast zone
    if (isInBlastZone(p1.position, center)) {
      damage.p1 += CONSTANTS.MINE_DAMAGE;
    }
    if (isInBlastZone(p2.position, center)) {
      damage.p2 += CONSTANTS.MINE_DAMAGE;
    }

    // Check which mines are caught in this blast zone (chain reaction)
    for (const m of mines) {
      if (!m.active || blasted.has(m.id)) continue;
      if (isInBlastZone(m, center)) {
        blasted.add(m.id);
        m.active = false;
        queue.push({ x: m.x, y: m.y, z: m.z }); // add to chain
      }
    }
  }

  return damage;
}

// ─── CHECK SUB VS SUB COLLISION ──────────────────────────────────────────────
// If both subs occupy the same cell → instant draw.
function checkSubCollision(p1, p2) {
  return positionsOverlap(p1.position, p2.position);
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────

// Two positions overlap if they're within 0.5 units (same cell after rounding)
function positionsOverlap(a, b) {
  return Math.abs(a.x - b.x) < 0.5 &&
         Math.abs(a.y - b.y) < 0.5 &&
         Math.abs(a.z - b.z) < 0.5;
}

// Blast zone = 3×3×3 cube = center ± 1 on each axis
function isInBlastZone(pos, center) {
  return Math.abs(pos.x - center.x) <= CONSTANTS.BLAST_RADIUS &&
         Math.abs(pos.y - center.y) <= CONSTANTS.BLAST_RADIUS &&
         Math.abs(pos.z - center.z) <= CONSTANTS.BLAST_RADIUS;
}

function generateId() {
  return Math.random().toString(36).substr(2, 9);
}

module.exports = {
  fireTorpedo,
  deployMine,
  advanceTorpedoes,
  advanceMines,
  detectTorpedoCollisions,
  detectMineProximityTriggers,
  resolveBlast,
  checkSubCollision,
  isInBlastZone,
};