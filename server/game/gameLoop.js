const { processBlink, buildBotState } = require('../engine/blinkLoop');
const { prepareNextRound }             = require('../engine/roundManager');
const { endMatch }                     = require('./matchManager');
const { CONSTANTS }                    = require('../engine/gameState');
const { runCBot }                      = require('../sandbox/cSandbox');
const db                               = require('../config/db');

// ─── START GAME LOOP ─────────────────────────────────────────────────────────
function startGameLoop(match, io) {
  match.timeLeft = CONSTANTS.ROUND_DURATION;

  match.interval = setInterval(async () => {
    try {
      await runBlink(match, io);
    } catch (err) {
      console.error(`Blink error in match ${match.id}:`, err.message);
    }
  }, CONSTANTS.BLINK_INTERVAL);
}

// ─── RUN ONE BLINK ───────────────────────────────────────────────────────────
async function runBlink(match, io) {
  const { state } = match;

  match.timeLeft -= 1;

  const p1BotState = buildBotState(state.players.p1, state.players.p2, state, match.timeLeft);
  const p2BotState = buildBotState(state.players.p2, state.players.p1, state, match.timeLeft);

  const [p1Action, p2Action] = await Promise.all([
    runBot(match, 'p1', p1BotState),
    runBot(match, 'p2', p2BotState),
  ]);

  // Process blink — damage applied here, prepareNextRound NOT called yet
  processBlink(state, p1Action, p2Action, match.timeLeft);

  // Broadcast BEFORE resetting — clients see the damage HP
  broadcastBlinkState(match, io);

  // Now handle phase transitions AFTER client has received the damaged state
  if (state.phase === 'between_rounds') {
    handleBetweenRounds(match, io);
  } else if (state.phase === 'finished') {
    await handleMatchEnd(match, io);
  }
}

// ─── RUN A SINGLE BOT ────────────────────────────────────────────────────────
async function runBot(match, slot, botState) {
  const player = match.players[slot];

  if (!match.state.players[slot].powered) {
    return { action: 'idle' };
  }

  if (player.language === 'c' && player.binaryPath) {
    try {
      const action = await runCBot(player.binaryPath, botState);
      return action || { action: 'idle' };
    } catch (err) {
      match.state.players[slot].powered   = false;
      match.state.players[slot].lastError = { message: err.message, line: 0 };
      return { action: 'idle' };
    }
  }

  const action = match.pendingActions?.[slot] || { action: 'idle' };
  if (match.pendingActions) match.pendingActions[slot] = null;
  return action;
}

// ─── BROADCAST BLINK STATE ───────────────────────────────────────────────────
function broadcastBlinkState(match, io) {
  const { state } = match;

  io.to(match.players.p1.socketId).emit('blink', {
    blink:           state.blink,
    round:           state.round,
    timeLeft:        match.timeLeft,
    phase:           state.phase,
    self:            sanitizePlayer(state.players.p1),
    opponent:        sanitizeOpponent(state.players.p2),
    torpedoes:       state.torpedoes.filter(t => t.active),
    mines:           state.mines.filter(m => m.active),
    sonarResults:    state.players.p1.sonarResults || [],
    hitLog:          state.hitLog,
    roundScores:     state.roundScores,
    lastRoundResult: state.lastRoundResult || null,
  });

  io.to(match.players.p2.socketId).emit('blink', {
    blink:           state.blink,
    round:           state.round,
    timeLeft:        match.timeLeft,
    phase:           state.phase,
    self:            sanitizePlayer(state.players.p2),
    opponent:        sanitizeOpponent(state.players.p1),
    torpedoes:       state.torpedoes.filter(t => t.active),
    mines:           state.mines.filter(m => m.active),
    sonarResults:    state.players.p2.sonarResults || [],
    hitLog:          state.hitLog,
    roundScores:     state.roundScores,
    lastRoundResult: state.lastRoundResult || null,
  });
}

// ─── HANDLE BETWEEN ROUNDS ───────────────────────────────────────────────────
function handleBetweenRounds(match, io) {
  clearInterval(match.interval);
  match.interval = null;

  const roundResult = match.state.lastRoundResult;
  const roundScores = match.state.roundScores;

  // Emit round_end FIRST — clients show between-round screen with correct HP
  io.to(match.players.p1.socketId).emit('round_end', {
    result:      roundResult,
    roundScores: roundScores,
    nextRound:   match.state.round,
    timeoutSecs: CONSTANTS.BETWEEN_ROUND_TIMEOUT,
  });
  io.to(match.players.p2.socketId).emit('round_end', {
    result:      roundResult,
    roundScores: roundScores,
    nextRound:   match.state.round,
    timeoutSecs: CONSTANTS.BETWEEN_ROUND_TIMEOUT,
  });

  // Reset ready tracking
  match.readyPlayers = new Set();

  // Reset positions for next round — HP already carries over
  prepareNextRound(match.state);

  // Keep phase as between_rounds so ready button works
  match.state.phase = 'between_rounds';

  // Auto-start after timeout
  match.betweenTimer = setTimeout(() => {
    if (match.state.phase === 'between_rounds') {
      startNextRound(match, io);
    }
  }, CONSTANTS.BETWEEN_ROUND_TIMEOUT * 1000);
}

// ─── HANDLE MATCH END ────────────────────────────────────────────────────────
async function handleMatchEnd(match, io) {
  clearInterval(match.interval);
  match.interval = null;

  const { state } = match;
  const p1Id     = match.players.p1.userId;
  const p2Id     = match.players.p2.userId;
  const winnerId = state.winner === 'p1' ? p1Id
                 : state.winner === 'p2' ? p2Id
                 : null;

  try {
    const [r1, r2] = await Promise.all([
      db.query('SELECT elo, wins, losses, draws, matches_played FROM users WHERE id = $1', [p1Id]),
      db.query('SELECT elo, wins, losses, draws, matches_played FROM users WHERE id = $1', [p2Id]),
    ]);

    const p1 = r1.rows[0];
    const p2 = r2.rows[0];
    const p1EloOld = p1.elo || 1000;
    const p2EloOld = p2.elo || 1000;

    const K = 32;
    const p1Expected  = 1 / (1 + Math.pow(10, (p2EloOld - p1EloOld) / 400));
    const p2Expected  = 1 - p1Expected;
    const p1Score     = state.winner === 'p1' ? 1 : state.winner === 'p2' ? 0 : 0.5;
    const p2Score     = 1 - p1Score;
    const p1EloNew    = Math.round(p1EloOld + K * (p1Score - p1Expected));
    const p2EloNew    = Math.round(p2EloOld + K * (p2Score - p2Expected));
    const p1EloChange = p1EloNew - p1EloOld;
    const p2EloChange = p2EloNew - p2EloOld;

    const p1Wins   = (p1.wins   || 0) + (state.winner === 'p1' ? 1 : 0);
    const p1Losses = (p1.losses || 0) + (state.winner === 'p2' ? 1 : 0);
    const p1Draws  = (p1.draws  || 0) + (!state.winner ? 1 : 0);
    const p2Wins   = (p2.wins   || 0) + (state.winner === 'p2' ? 1 : 0);
    const p2Losses = (p2.losses || 0) + (state.winner === 'p1' ? 1 : 0);
    const p2Draws  = (p2.draws  || 0) + (!state.winner ? 1 : 0);

    await Promise.all([
      db.query(
        `UPDATE users SET elo=$1, wins=$2, losses=$3, draws=$4,
         matches_played=matches_played+1 WHERE id=$5`,
        [p1EloNew, p1Wins, p1Losses, p1Draws, p1Id]
      ),
      db.query(
        `UPDATE users SET elo=$1, wins=$2, losses=$3, draws=$4,
         matches_played=matches_played+1 WHERE id=$5`,
        [p2EloNew, p2Wins, p2Losses, p2Draws, p2Id]
      ),
    ]);

    await Promise.all([
      db.query(
        `INSERT INTO leaderboard (user_id, elo, wins, losses, draws, matches_played)
         VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (user_id) DO UPDATE SET
         elo=$2, wins=$3, losses=$4, draws=$5, matches_played=$6, updated_at=NOW()`,
        [p1Id, p1EloNew, p1Wins, p1Losses, p1Draws, (p1.matches_played||0)+1]
      ),
      db.query(
        `INSERT INTO leaderboard (user_id, elo, wins, losses, draws, matches_played)
         VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (user_id) DO UPDATE SET
         elo=$2, wins=$3, losses=$4, draws=$5, matches_played=$6, updated_at=NOW()`,
        [p2Id, p2EloNew, p2Wins, p2Losses, p2Draws, (p2.matches_played||0)+1]
      ),
    ]);

    const dbResult = await db.query(
      `INSERT INTO matches
        (player1_id, player2_id, winner_id, mode,
         player1_elo_before, player2_elo_before,
         player1_elo_after,  player2_elo_after,
         player1_elo_change, player2_elo_change,
         player1_script_name, player2_script_name, final_score)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       RETURNING id`,
      [
        p1Id, p2Id, winnerId,
        match.rated ? 'ranked' : 'unrated',
        p1EloOld, p2EloOld,
        p1EloNew, p2EloNew,
        p1EloChange, p2EloChange,
        match.players.p1.scriptName || 'unknown',
        match.players.p2.scriptName || 'unknown',
        `${state.roundScores.p1}-${state.roundScores.p2}`,
      ]
    );

    const matchDbId = dbResult.rows[0].id;

    await db.query(
      `INSERT INTO replays (match_id, blink_states) VALUES ($1, $2)`,
      [matchDbId, JSON.stringify(state.replayLog)]
    );

    io.to(match.players.p1.socketId).emit('match_end', {
      winner:      state.winner,
      roundScores: state.roundScores,
      matchId:     matchDbId,
      eloChange:   p1EloChange,
      newElo:      p1EloNew,
    });
    io.to(match.players.p2.socketId).emit('match_end', {
      winner:      state.winner,
      roundScores: state.roundScores,
      matchId:     matchDbId,
      eloChange:   p2EloChange,
      newElo:      p2EloNew,
    });

    console.log(`Match saved: ${matchDbId} | P1 ELO ${p1EloOld}→${p1EloNew} | P2 ELO ${p2EloOld}→${p2EloNew}`);

  } catch (err) {
    console.error('Failed to save match result:', err.message);
  }

  endMatch(match.id);
}

// ─── START NEXT ROUND ────────────────────────────────────────────────────────
function startNextRound(match, io) {
  if (match.betweenTimer) {
    clearTimeout(match.betweenTimer);
    match.betweenTimer = null;
  }

  match.state.phase = 'playing';
  match.timeLeft    = CONSTANTS.ROUND_DURATION;

  io.to(match.players.p1.socketId).emit('round_start', {
    round: match.state.round,
  });
  io.to(match.players.p2.socketId).emit('round_start', {
    round: match.state.round,
  });

  startGameLoop(match, io);
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────
function sanitizePlayer(player) {
  return {
    position:    player.position,
    hp:          player.hp,
    torpedoes:   player.torpedoes,
    mines:       player.mines,
    speed:       player.speed,
    noiseRadius: player.noiseRadius,
    outOfBounds: player.outOfBounds,
    powered:     player.powered,
    lastError:   player.lastError,
  };
}

function sanitizeOpponent(player) {
  return {
    hp:      player.hp,
    powered: player.powered,
  };
}

module.exports = { startGameLoop, startNextRound };
