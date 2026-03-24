const { CONSTANTS }          = require('./gameState');
const { applyMovement, applySinking, applyOobDamage } = require('./movement');
const { getSonarResults }    = require('./sonar');
const { fireTorpedo, deployMine, advanceTorpedoes, advanceMines,
        detectTorpedoCollisions, detectMineProximityTriggers,
        resolveBlast, checkSubCollision } = require('./weapons');
const { checkRoundEnd, applyRoundResult,
        checkMatchEnd, prepareNextRound } = require('./roundManager');

// ─── PROCESS ONE BLINK ───────────────────────────────────────────────────────
// This is called every 2 seconds per active match.
// It takes the full match state + both bot actions and returns the updated state.
//
// Order of operations per blink (matches the design doc):
// 1.  Apply pending code swaps
// 2.  Apply powered/sinking state
// 3.  Process both bot actions simultaneously
// 4.  Move torpedoes
// 5.  Move mines
// 6.  Detect torpedo collisions → resolve blasts + chains
// 7.  Detect mine proximity triggers → resolve blasts + chains
// 8.  Apply out-of-bounds damage
// 9.  Check sub-sub collision
// 10. Check round-end conditions
// 11. Build sonar results for next blink
// 12. Snapshot state for replay
//
function processBlink(matchState, p1Action, p2Action, timeLeft) {
  const { players, torpedoes, mines } = matchState;
  const p1 = players.p1;
  const p2 = players.p2;

  matchState.blink++;

  // ── 1. Apply pending code swaps ──────────────────────────────────────────
  if (p1.pendingScript !== null) {
    p1.script        = p1.pendingScript;
    p1.pendingScript = null;
  }
  if (p2.pendingScript !== null) {
    p2.script        = p2.pendingScript;
    p2.pendingScript = null;
  }

  // ── 2. Handle powered/unpowered state ────────────────────────────────────
  // Unpowered subs sink regardless of their action
  if (!p1.powered) { applySinking(p1); p1Action = { action: 'idle' }; }
  if (!p2.powered) { applySinking(p2); p2Action = { action: 'idle' }; }

  // ── 3. Process both actions simultaneously ───────────────────────────────
  processAction(p1, p1Action, matchState);
  processAction(p2, p2Action, matchState);

  // ── 4. Move torpedoes ────────────────────────────────────────────────────
  advanceTorpedoes(torpedoes);

  // ── 5. Move mines ────────────────────────────────────────────────────────
  advanceMines(mines);

  // ── 6. Detect torpedo collisions + resolve blasts ────────────────────────
  const torpedoEvents = detectTorpedoCollisions(torpedoes, p1, p2, mines);
  for (const event of torpedoEvents) {
    if (event.type === 'torpedo_hit_sub') {
      const dmg = resolveBlast(event.torpedo, p1, p2, mines);
      applyDamage(p1, p2, dmg, matchState);
    } else if (event.type === 'torpedo_hit_mine') {
      // Torpedo blast + mine blast = two blasts at same point
      const dmg1 = resolveBlast(event.torpedo, p1, p2, mines);
      const dmg2 = resolveBlast(event.mine,    p1, p2, mines);
      applyDamage(p1, p2, { p1: dmg1.p1 + dmg2.p1, p2: dmg1.p2 + dmg2.p2 }, matchState);
    } else if (event.type === 'torpedo_vs_torpedo') {
      // Two blasts at the same point
      const dmg1 = resolveBlast(event.t1, p1, p2, mines);
      const dmg2 = resolveBlast(event.t2, p1, p2, mines);
      applyDamage(p1, p2, { p1: dmg1.p1 + dmg2.p1, p2: dmg1.p2 + dmg2.p2 }, matchState);
    }
  }

  // ── 7. Detect mine proximity triggers + resolve blasts ───────────────────
  const mineEvents = detectMineProximityTriggers(mines, p1, p2);
  for (const event of mineEvents) {
    if (event.mine) {
      const dmg = resolveBlast(event.mine, p1, p2, mines);
      applyDamage(p1, p2, dmg, matchState);
    }
    if (event.chainMine) {
      const dmg = resolveBlast(event.chainMine, p1, p2, mines);
      applyDamage(p1, p2, dmg, matchState);
    }
  }

  // ── 8. Apply out-of-bounds damage ────────────────────────────────────────
  applyOobDamage(p1);
  applyOobDamage(p2);

  // ── 9. Check sub-sub collision ───────────────────────────────────────────
  const isCollision = checkSubCollision(p1, p2);

  // ── 10. Check round-end conditions ───────────────────────────────────────
  const roundResult = checkRoundEnd(p1, p2, isCollision, timeLeft);
  if (roundResult && roundResult.over) {
    applyRoundResult(matchState, roundResult);
    const matchResult = checkMatchEnd(matchState.roundScores, matchState.round);

    if (matchResult) {
      matchState.phase = 'finished';
      matchState.winner = matchResult.winner;
    } else {
      prepareNextRound(matchState);
    }

    matchState.lastRoundResult = roundResult;
  }

  // ── 11. Build sonar results for next blink ───────────────────────────────
  // These are attached to the state object sent to each bot
  p1.sonarResults = getSonarResults(p1, p2, mines);
  p2.sonarResults = getSonarResults(p2, p1, mines);

  // ── 12. Snapshot for replay ──────────────────────────────────────────────
  matchState.replayLog.push(snapshotBlink(matchState, timeLeft));

  return matchState;
}

// ─── PROCESS A SINGLE ACTION ─────────────────────────────────────────────────
function processAction(player, action, matchState) {
  if (!action || !action.action) return;

  switch (action.action) {
    case 'move':
      applyMovement(player, action);
      break;

    case 'fire':
      if (action.target) {
        const torpedo = fireTorpedo(player, action);
        if (torpedo) matchState.torpedoes.push(torpedo);
      }
      break;

    case 'mine':
      const mine = deployMine(player, action);
      if (mine) matchState.mines.push(mine);
      break;

    case 'idle':
      player.speed      = 'idle';
      player.noiseRadius = CONSTANTS.NOISE_RADIUS.idle;
      break;
  }
}

// ─── APPLY DAMAGE TO PLAYERS ─────────────────────────────────────────────────
function applyDamage(p1, p2, damage, matchState) {
  if (damage.p1 > 0) {
    p1.hp = Math.max(0, p1.hp - damage.p1);
    matchState.hitLog.push({
      blink:  matchState.blink,
      target: 'p1',
      damage: damage.p1,
      source: 'weapon',
    });
  }
  if (damage.p2 > 0) {
    p2.hp = Math.max(0, p2.hp - damage.p2);
    matchState.hitLog.push({
      blink:  matchState.blink,
      target: 'p2',
      damage: damage.p2,
      source: 'weapon',
    });
  }
}

// ─── SNAPSHOT BLINK FOR REPLAY ───────────────────────────────────────────────
// Creates a lightweight snapshot of the current state for the replay system.
function snapshotBlink(matchState, timeLeft) {
  const { players, torpedoes, mines, blink, round } = matchState;
  return {
    blink,
    round,
    timeLeft,
    p1: {
      position:    { ...players.p1.position },
      hp:          players.p1.hp,
      torpedoes:   players.p1.torpedoes,
      mines:       players.p1.mines,
      speed:       players.p1.speed,
      noiseRadius: players.p1.noiseRadius,
      outOfBounds: players.p1.outOfBounds,
      powered:     players.p1.powered,
      sonarResults: players.p1.sonarResults || [],
    },
    p2: {
      position:    { ...players.p2.position },
      hp:          players.p2.hp,
      torpedoes:   players.p2.torpedoes,
      mines:       players.p2.mines,
      speed:       players.p2.speed,
      noiseRadius: players.p2.noiseRadius,
      outOfBounds: players.p2.outOfBounds,
      powered:     players.p2.powered,
      sonarResults: players.p2.sonarResults || [],
    },
    torpedoes: torpedoes.filter(t => t.active).map(t => ({
      id: t.id, owner: t.owner,
      x: Math.round(t.x), y: Math.round(t.y), z: Math.round(t.z),
    })),
    mines: mines.filter(m => m.active).map(m => ({
      id: m.id, owner: m.owner,
      x: m.x, y: m.y, z: m.z, settled: m.settled,
    })),
  };
}

// ─── BUILD STATE OBJECT FOR BOT ──────────────────────────────────────────────
// Builds the state object that gets passed into each player's bot function.
function buildBotState(player, opponent, matchState, timeLeft) {
  return {
    self: {
      position:    { ...player.position },
      speed:       player.speed,
      noise_radius: player.noiseRadius,
      health:      player.hp,
      torpedoes:   player.torpedoes,
      mines:       player.mines,
      out_of_bounds: player.outOfBounds,
      powered:     player.powered,
    },
    sonar_results: player.sonarResults || [],
    my_mines: matchState.mines
      .filter(m => m.active && m.owner === player.slot)
      .map(m => ({
        id: m.id, x: m.x, y: m.y, z: m.z,
        target_depth: m.targetDepth, settled: m.settled,
      })),
    hit_log: matchState.hitLog
      .filter(h => h.target === player.slot)
      .map(h => ({
        blink:  h.blink,
        type:   'received',
        source: h.source,
        damage: h.damage,
      })),
    round:     matchState.round,
    blink:     matchState.blink,
    time_left: timeLeft,
  };
}

module.exports = { processBlink, buildBotState };