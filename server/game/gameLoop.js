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
  match.timeLeft -= 2;  // 2 seconds per blink

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
  const winnerId = state.winner === 'p1'
    ? match.players.p1.userId
    : state.winner === 'p2'
    ? match.players.p2.userId
    : null;

  // Save replay to database
  try {
    const dbResult = await db.query(
      `INSERT INTO matches
        (player1_id, player2_id, winner_id, mode,
         player1_elo_before, player2_elo_before,
         player1_script_name, player2_script_name, final_score)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING id`,
      [
        match.players.p1.userId,
        match.players.p2.userId,
        winnerId,
        match.rated ? 'ranked' : 'unrated',
        match.players.p1.elo,
        match.players.p2.elo,
        match.players.p1.scriptName || 'unknown',
        match.players.p2.scriptName || 'unknown',
        `${state.roundScores.p1}-${state.roundScores.p2}`,
      ]
    );

    const matchDbId = dbResult.rows[0].id;

    // Save replay blinkstates
    await db.query(
      `INSERT INTO replays (match_id, blink_states) VALUES ($1, $2)`,
      [matchDbId, JSON.stringify(state.replayLog)]
    );

    // Broadcast match end to both players
    io.to(match.players.p1.socketId).emit('match_end', {
      winner:      state.winner,
      roundScores: state.roundScores,
      matchId:     matchDbId,
    });
    io.to(match.players.p2.socketId).emit('match_end', {
      winner:      state.winner,
      roundScores: state.roundScores,
      matchId:     matchDbId,
    });

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