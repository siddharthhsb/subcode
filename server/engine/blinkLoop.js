const { CONSTANTS }          = require('./gameState');
const { applyMovement, applySinking, applyOobDamage } = require('./movement');
const { getSonarResults }    = require('./sonar');
const { fireTorpedo, deployMine, advanceTorpedoes, advanceMines,
        detectTorpedoCollisions, detectMineProximityTriggers,
        resolveBlast, checkSubCollision } = require('./weapons');
const { checkRoundEnd, applyRoundResult,
        checkMatchEnd } = require('./roundManager');

// ─── PROCESS ONE BLINK ───────────────────────────────────────────────────────
function processBlink(matchState, p1Action, p2Action, timeLeft) {
  const { players, torpedoes, mines } = matchState;
  const p1 = players.p1;
  const p2 = players.p2;

  matchState.blink++;
  p1.hitThisBlink = false;
  p2.hitThisBlink = false;

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
  if (!p1.powered) { applySinking(p1); p1Action = { action: 'idle' }; }
  if (!p2.powered) { applySinking(p2); p2Action = { action: 'idle' }; }

  // ── 3. Process both actions simultaneously ───────────────────────────────
  processAction(p1, p1Action, matchState);
  processAction(p2, p2Action, matchState);

  // ── 4. Move torpedoes ────────────────────────────────────────────────────
  advanceTorpedoes(torpedoes);

  // ── 5. Move mines ────────────────────────────────────────────────────────
  advanceMines(mines);
  // Track which blink each mine was deployed on
  for (const m of mines) {
    if (m.active && m.deployedBlink === null) {
      m.deployedBlink = matchState.blink;
    }
  }

  // ── 6. Detect torpedo collisions + resolve blasts ────────────────────────
  const torpedoEvents = detectTorpedoCollisions(torpedoes, p1, p2, mines);
  for (const event of torpedoEvents) {
    if (event.type === 'torpedo_hit_sub') {
      const dmg = resolveBlast(event.torpedo, p1, p2, mines);
      applyDamage(p1, p2, dmg, matchState);
    } else if (event.type === 'torpedo_hit_mine') {
      const dmg1 = resolveBlast(event.torpedo, p1, p2, mines);
      const dmg2 = resolveBlast(event.mine,    p1, p2, mines);
      applyDamage(p1, p2, { p1: dmg1.p1 + dmg2.p1, p2: dmg1.p2 + dmg2.p2 }, matchState);
    } else if (event.type === 'torpedo_vs_torpedo') {
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
  console.log(`Blink ${matchState.blink}: p1HP=${p1.hp} p2HP=${p2.hp} p1Hit=${p1.hitThisBlink} p2Hit=${p2.hitThisBlink} roundResult=${JSON.stringify(roundResult)}`);
  if (roundResult && roundResult.over) {
    applyRoundResult(matchState, roundResult);
    matchState.lastRoundResult = roundResult;
    console.log(`Round over. Scores: p1=${matchState.roundScores.p1} p2=${matchState.roundScores.p2} round=${matchState.round}`);
    const matchResult = checkMatchEnd(matchState.roundScores, matchState.round);
    console.log(`checkMatchEnd result: ${JSON.stringify(matchResult)}`);
    if (matchResult) {
      matchState.phase  = 'finished';
      matchState.winner = matchResult.winner;
    } else {
      matchState.phase = 'between_rounds';
    }
  }

  // ── 11. Build sonar results for next blink ───────────────────────────────
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
      player.speed       = 'idle';
      player.noiseRadius = CONSTANTS.NOISE_RADIUS.idle;
      break;
  }
}

// ─── APPLY DAMAGE TO PLAYERS ─────────────────────────────────────────────────
function applyDamage(p1, p2, damage, matchState) {
  if (damage.p1 > 0) {
    p1.hp = Math.max(0, p1.hp - damage.p1);
    p1.hitThisBlink = true;
    matchState.hitLog.push({
      blink:  matchState.blink,
      target: 'p1',
      damage: damage.p1,
      source: 'weapon',
    });
  }
  if (damage.p2 > 0) {
    p2.hp = Math.max(0, p2.hp - damage.p2);
    p2.hitThisBlink = true;
    matchState.hitLog.push({
      blink:  matchState.blink,
      target: 'p2',
      damage: damage.p2,
      source: 'weapon',
    });
  }
}

// ─── SNAPSHOT BLINK FOR REPLAY ───────────────────────────────────────────────
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
  tx: t.targetX, ty: t.targetY, tz: t.targetZ,
})),
    mines: mines.filter(m => m.active).map(m => ({
      id: m.id, owner: m.owner,
      x: m.x, y: m.y, z: m.z, settled: m.settled,
    })),
  };
}

// ─── BUILD STATE OBJECT FOR BOT ──────────────────────────────────────────────
function buildBotState(player, opponent, matchState, timeLeft) {
  return {
    self: {
      position:      { ...player.position },
      speed:         player.speed,
      noise_radius:  player.noiseRadius,
      health:        player.hp,
      torpedoes:     player.torpedoes,
      mines:         player.mines,
      out_of_bounds: player.outOfBounds,
      powered:       player.powered,
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
