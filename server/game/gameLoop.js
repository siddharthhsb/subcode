const { processBlink, buildBotState } = require('../engine/blinkLoop');
const { endMatch }                     = require('./matchManager');
const { CONSTANTS }                    = require('../engine/gameState');
const { runCBot }                      = require('../sandbox/cSandbox');
const db                               = require('../config/db');

// ─── START GAME LOOP ─────────────────────────────────────────────────────────
// Called when a match starts. Runs the blink loop every 2 seconds.
function startGameLoop(match, io) {
  // Reset time
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

  // Decrement timer
  match.timeLeft -= 1;

  // Build state objects for each bot
  const p1BotState = buildBotState(
    state.players.p1,
    state.players.p2,
    state,
    match.timeLeft
  );
  const p2BotState = buildBotState(
    state.players.p2,
    state.players.p1,
    state,
    match.timeLeft
  );

  // Run both bots simultaneously (Promise.all = parallel execution)
  const [p1Action, p2Action] = await Promise.all([
    runBot(match, 'p1', p1BotState),
    runBot(match, 'p2', p2BotState),
  ]);

  // Process the blink through the game engine
  processBlink(state, p1Action, p2Action, match.timeLeft);

  // Broadcast the new state to both players
  broadcastBlinkState(match, io);

  // Check if the match phase changed
  if (state.phase === 'between_rounds') {
    handleBetweenRounds(match, io);
  } else if (state.phase === 'finished') {
    await handleMatchEnd(match, io);
  }
}

// ─── RUN A SINGLE BOT ────────────────────────────────────────────────────────
// Runs the player's bot code and returns an action.
// Python bots run client-side — the action is sent from the browser.
// C bots run server-side via Docker.
async function runBot(match, slot, botState) {
  const player = match.players[slot];

  // If the player's sub has lost power, force idle
  if (!match.state.players[slot].powered) {
    return { action: 'idle' };
  }

  // C bots run on the server
  if (player.language === 'c' && player.binaryPath) {
    try {
      const action = await runCBot(player.binaryPath, botState);
      return action || { action: 'idle' };
    } catch (err) {
      // C bot crashed — mark as unpowered
      match.state.players[slot].powered  = false;
      match.state.players[slot].lastError = { message: err.message, line: 0 };
      return { action: 'idle' };
    }
  }

  // Python bots: the action was sent from the browser before this blink
  // Use the queued action, then clear it
  const action = match.pendingActions?.[slot] || { action: 'idle' };
  if (match.pendingActions) match.pendingActions[slot] = null;
  return action;
}

// ─── BROADCAST BLINK STATE ───────────────────────────────────────────────────
// Sends the current game state to both players after each blink.
// Each player gets their own view (their sonar results only).
function broadcastBlinkState(match, io) {
  const { state } = match;

  // P1 gets their own perspective
  io.to(match.players.p1.socketId).emit('blink', {
    blink:    state.blink,
    round:    state.round,
    timeLeft: match.timeLeft,
    phase:    state.phase,
    self:     sanitizePlayer(state.players.p1),
    opponent: sanitizeOpponent(state.players.p2),
    torpedoes: state.torpedoes.filter(t => t.active),
    mines:     state.mines.filter(m => m.active),
    sonarResults: state.players.p1.sonarResults || [],
    hitLog:    state.hitLog,
    roundScores: state.roundScores,
    lastRoundResult: state.lastRoundResult || null,
  });

  // P2 gets their own perspective
  io.to(match.players.p2.socketId).emit('blink', {
    blink:    state.blink,
    round:    state.round,
    timeLeft: match.timeLeft,
    phase:    state.phase,
    self:     sanitizePlayer(state.players.p2),
    opponent: sanitizeOpponent(state.players.p1),
    torpedoes: state.torpedoes.filter(t => t.active),
    mines:     state.mines.filter(m => m.active),
    sonarResults: state.players.p2.sonarResults || [],
    hitLog:    state.hitLog,
    roundScores: state.roundScores,
    lastRoundResult: state.lastRoundResult || null,
  });
}

// ─── HANDLE BETWEEN ROUNDS ───────────────────────────────────────────────────
function handleBetweenRounds(match, io) {
  // Stop the blink loop during the break
  clearInterval(match.interval);
  match.interval = null;

  // Tell both players the round ended
  io.to(match.players.p1.socketId).emit('round_end', {
    result:      match.state.lastRoundResult,
    roundScores: match.state.roundScores,
    nextRound:   match.state.round,
    timeoutSecs: CONSTANTS.BETWEEN_ROUND_TIMEOUT,
  });
  io.to(match.players.p2.socketId).emit('round_end', {
    result:      match.state.lastRoundResult,
    roundScores: match.state.roundScores,
    nextRound:   match.state.round,
    timeoutSecs: CONSTANTS.BETWEEN_ROUND_TIMEOUT,
  });

  // Start the between-round countdown
  match.betweenTimer = setTimeout(() => {
    match.state.phase = 'playing';
    match.timeLeft    = CONSTANTS.ROUND_DURATION;

    // Tell both players the new round is starting
    io.to(match.players.p1.socketId).emit('round_start', {
      round: match.state.round,
    });
    io.to(match.players.p2.socketId).emit('round_start', {
      round: match.state.round,
    });

    // Restart the blink loop
    startGameLoop(match, io);
  }, CONSTANTS.BETWEEN_ROUND_TIMEOUT * 1000);
}

// ─── HANDLE MATCH END ────────────────────────────────────────────────────────
async function handleMatchEnd(match, io) {
  clearInterval(match.interval);
  match.interval = null;

  const { state } = match;
  const p1Id = match.players.p1.userId;
  const p2Id = match.players.p2.userId;
  const winnerId = state.winner === 'p1' ? p1Id
                 : state.winner === 'p2' ? p2Id
                 : null;

  try {
    // Fetch current ELO from DB
    const [r1, r2] = await Promise.all([
      db.query('SELECT elo, wins, losses, draws, matches_played FROM users WHERE id = $1', [p1Id]),
      db.query('SELECT elo, wins, losses, draws, matches_played FROM users WHERE id = $1', [p2Id]),
    ]);

    const p1 = r1.rows[0];
    const p2 = r2.rows[0];
    const p1EloOld = p1.elo || 1000;
    const p2EloOld = p2.elo || 1000;

    // ELO calculation
    const K = 32;
    const p1Expected = 1 / (1 + Math.pow(10, (p2EloOld - p1EloOld) / 400));
    const p2Expected = 1 - p1Expected;
    const p1Score = state.winner === 'p1' ? 1 : state.winner === 'p2' ? 0 : 0.5;
    const p2Score = 1 - p1Score;

    const p1EloNew = Math.round(p1EloOld + K * (p1Score - p1Expected));
    const p2EloNew = Math.round(p2EloOld + K * (p2Score - p2Expected));
    const p1EloChange = p1EloNew - p1EloOld;
    const p2EloChange = p2EloNew - p2EloOld;

    // W/L/D
    const p1Wins   = (p1.wins || 0)   + (state.winner === 'p1' ? 1 : 0);
    const p1Losses = (p1.losses || 0) + (state.winner === 'p2' ? 1 : 0);
    const p1Draws  = (p1.draws || 0)  + (!state.winner ? 1 : 0);
    const p2Wins   = (p2.wins || 0)   + (state.winner === 'p2' ? 1 : 0);
    const p2Losses = (p2.losses || 0) + (state.winner === 'p1' ? 1 : 0);
    const p2Draws  = (p2.draws || 0)  + (!state.winner ? 1 : 0);

    // Update users table
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

    // Update leaderboard table
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

    // Save match to DB
    const dbResult = await db.query(
      `INSERT INTO matches
        (player1_id, player2_id, winner_id, mode,
         player1_elo_before, player2_elo_before,
         player1_elo_after, player2_elo_after,
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

    // Save replay
    await db.query(
      `INSERT INTO replays (match_id, blink_states) VALUES ($1, $2)`,
      [matchDbId, JSON.stringify(state.replayLog)]
    );

    // Broadcast match end
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

// ─── HELPERS ─────────────────────────────────────────────────────────────────
// Only send what each player should see about themselves
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

// Only send what a player should see about their opponent
function sanitizeOpponent(player) {
  return {
    hp:          player.hp,
    powered:     player.powered,
    // Position and speed hidden — must be discovered via sonar
  };
}

module.exports = { startGameLoop };