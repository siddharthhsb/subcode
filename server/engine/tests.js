const { CONSTANTS, createMatchState } = require('./gameState');
const { applyMovement, applySinking, applyOobDamage } = require('./movement');
const { getSonarResults, euclidean } = require('./sonar');
const { fireTorpedo, deployMine, resolveBlast, checkSubCollision } = require('./weapons');
const { checkRoundEnd } = require('./roundManager');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (e) {
    console.log(`  ❌ ${name}`);
    console.log(`     ${e.message}`);
    failed++;
  }
}

function assert(condition, msg) {
  if (!condition) throw new Error(msg || 'Assertion failed');
}

function assertEqual(a, b, msg) {
  if (a !== b) throw new Error(msg || `Expected ${b}, got ${a}`);
}

// ── MOVEMENT TESTS ────────────────────────────────────────────────────────────
console.log('\n── Movement ──');

test('slow moves 1 unit', () => {
  const match = createMatchState('u1','u2','python','python');
  const p1 = match.players.p1;
  applyMovement(p1, { action:'move', dx:1, dy:0, dz:0, speed:'slow' });
  assertEqual(p1.position.x, 2, 'x should be 2 (started at 1)');
});

test('fast moves 2 units', () => {
  const match = createMatchState('u1','u2','python','python');
  const p1 = match.players.p1;
  applyMovement(p1, { action:'move', dx:1, dy:0, dz:0, speed:'fast' });
  assertEqual(p1.position.x, 3, 'x should be 3 (1 + 2)');
});

test('max moves 3 units', () => {
  const match = createMatchState('u1','u2','python','python');
  const p1 = match.players.p1;
  applyMovement(p1, { action:'move', dx:1, dy:0, dz:0, speed:'max' });
  assertEqual(p1.position.x, 4, 'x should be 4 (1 + 3)');
});

test('Z clamps at 0 (surface)', () => {
  const match = createMatchState('u1','u2','python','python');
  const p1 = match.players.p1; // starts at z=1
  applyMovement(p1, { action:'move', dx:0, dy:0, dz:-1, speed:'max' });
  assertEqual(p1.position.z, 0, 'Z should clamp at 0');
});

test('Z clamps at 9 (seafloor)', () => {
  const match = createMatchState('u1','u2','python','python');
  const p1 = match.players.p1;
  p1.position.z = 8;
  applyMovement(p1, { action:'move', dx:0, dy:0, dz:1, speed:'max' });
  assertEqual(p1.position.z, 9, 'Z should clamp at 9');
});

test('out of bounds sets flag', () => {
  const match = createMatchState('u1','u2','python','python');
  const p1 = match.players.p1;
  p1.position.x = 9;
  applyMovement(p1, { action:'move', dx:1, dy:0, dz:0, speed:'slow' });
  assert(p1.outOfBounds, 'Should be out of bounds');
});

test('OOB damage applies', () => {
  const match = createMatchState('u1','u2','python','python');
  const p1 = match.players.p1;
  p1.outOfBounds = true;
  applyOobDamage(p1);
  assertEqual(p1.hp, 60, 'HP should be 60 (100 - 40)');
});

test('noise radius correct for each speed', () => {
  const match = createMatchState('u1','u2','python','python');
  const p1 = match.players.p1;
  applyMovement(p1, { action:'move', dx:1, dy:0, dz:0, speed:'slow' });
  assertEqual(p1.noiseRadius, 3, 'slow = 3');
  applyMovement(p1, { action:'move', dx:1, dy:0, dz:0, speed:'fast' });
  assertEqual(p1.noiseRadius, 4, 'fast = 4');
  applyMovement(p1, { action:'move', dx:1, dy:0, dz:0, speed:'max' });
  assertEqual(p1.noiseRadius, 5, 'max = 5');
});

// ── SONAR TESTS ───────────────────────────────────────────────────────────────
console.log('\n── Sonar ──');

test('detects enemy within 3 units', () => {
  const match = createMatchState('u1','u2','python','python');
  const p1 = match.players.p1;
  const p2 = match.players.p2;
  p1.position = { x:5, y:5, z:5 };
  p2.position = { x:6, y:5, z:5 }; // 1 unit away
  const results = getSonarResults(p1, p2, []);
  assert(results.some(r => r.type === 'enemy_sub'), 'Should detect enemy');
});

test('does not detect enemy beyond 3 units', () => {
  const match = createMatchState('u1','u2','python','python');
  const p1 = match.players.p1;
  const p2 = match.players.p2;
  p1.position = { x:1, y:1, z:1 };
  p2.position = { x:8, y:8, z:8 }; // starting positions — far apart
  const results = getSonarResults(p1, p2, []);
  assert(!results.some(r => r.type === 'enemy_sub'), 'Should not detect enemy');
});

test('euclidean distance is correct', () => {
  const d = euclidean({x:0,y:0,z:0}, {x:3,y:4,z:0});
  assertEqual(d, 5, '3-4-5 triangle');
});

// ── WEAPONS TESTS ─────────────────────────────────────────────────────────────
console.log('\n── Weapons ──');

test('firing torpedo decrements ammo', () => {
  const match = createMatchState('u1','u2','python','python');
  const p1 = match.players.p1;
  fireTorpedo(p1, { action:'fire', target:{x:8,y:8,z:8} });
  assertEqual(p1.torpedoes, 5, 'Should have 5 torpedoes left');
});

test('cannot fire with 0 torpedoes', () => {
  const match = createMatchState('u1','u2','python','python');
  const p1 = match.players.p1;
  p1.torpedoes = 0;
  const t = fireTorpedo(p1, { action:'fire', target:{x:8,y:8,z:8} });
  assert(t === null, 'Should return null');
});

test('deploying mine decrements ammo', () => {
  const match = createMatchState('u1','u2','python','python');
  const p1 = match.players.p1;
  deployMine(p1, { action:'mine', target_depth:5 });
  assertEqual(p1.mines, 5, 'Should have 5 mines left');
});

test('blast zone hits sub within 1 unit', () => {
  const match = createMatchState('u1','u2','python','python');
  const p1 = match.players.p1;
  const p2 = match.players.p2;
  p1.position = { x:5, y:5, z:5 };
  p2.position = { x:6, y:5, z:5 }; // 1 unit away — inside blast
  const dmg = resolveBlast({ x:5, y:5, z:5 }, p1, p2, []);
  assertEqual(dmg.p1, 50, 'P1 should take 50 damage');
  assertEqual(dmg.p2, 50, 'P2 should take 50 damage');
});

test('blast zone misses sub beyond 1 unit', () => {
  const match = createMatchState('u1','u2','python','python');
  const p1 = match.players.p1;
  const p2 = match.players.p2;
  p1.position = { x:1, y:1, z:1 };
  p2.position = { x:8, y:8, z:8 };
  const dmg = resolveBlast({ x:5, y:5, z:5 }, p1, p2, []);
  assertEqual(dmg.p1, 0, 'P1 should take 0 damage');
  assertEqual(dmg.p2, 0, 'P2 should take 0 damage');
});

// ── ROUND MANAGER TESTS ───────────────────────────────────────────────────────
console.log('\n── Round Manager ──');

test('round ends when sub HP reaches 0', () => {
  const match = createMatchState('u1','u2','python','python');
  const p1 = match.players.p1;
  const p2 = match.players.p2;
  p2.hp = 0;
  const result = checkRoundEnd(p1, p2, false, 30);
  assert(result && result.winner === 'p1', 'P1 should win');
});

test('timer expiry — higher HP wins', () => {
  const match = createMatchState('u1','u2','python','python');
  const p1 = match.players.p1;
  const p2 = match.players.p2;
  p1.hp = 80;
  p2.hp = 60;
  const result = checkRoundEnd(p1, p2, false, 0);
  assert(result && result.winner === 'p1', 'P1 has more HP — should win');
});

test('sub collision is a draw', () => {
  const match = createMatchState('u1','u2','python','python');
  const p1 = match.players.p1;
  const p2 = match.players.p2;
  const result = checkRoundEnd(p1, p2, true, 30);
  assert(result && result.winner === null, 'Collision should be a draw');
  assertEqual(result.cause, 'collision_draw', 'Cause should be collision_draw');
});

test('ammo does not reset between rounds', () => {
  const match = createMatchState('u1','u2','python','python');
  const p1 = match.players.p1;
  p1.torpedoes = 3; // used 3 torpedoes
  p1.mines     = 1; // used 5 mines
  const { resetPlayerForRound } = require('./gameState');
  resetPlayerForRound(p1);
  assertEqual(p1.torpedoes, 3, 'Torpedoes should NOT reset');
  assertEqual(p1.mines,     1, 'Mines should NOT reset');
});

// ── SUMMARY ───────────────────────────────────────────────────────────────────
console.log(`\n── Results: ${passed} passed, ${failed} failed ──\n`);
if (failed > 0) process.exit(1);