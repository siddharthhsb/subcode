const jwt          = require('jsonwebtoken');
const db           = require('../config/db');
const { joinQueue, leaveQueue, runMatchmakingTick } = require('./matchmaking');
const { createMatch, getMatchByUserId, endMatch,
        updatePlayerScript }                         = require('./matchManager');
const { startGameLoop }                              = require('./gameLoop');

// ─── INITIALISE SOCKET.IO ────────────────────────────────────────────────────
function initSocketHandler(io) {

  // Run matchmaking tick every 2 seconds
  setInterval(() => {
    const pairs = runMatchmakingTick();
    for (const pair of pairs) {
      handleMatchFound(io, pair.p1, pair.p2);
    }
  }, 2000);

  // ── CONNECTION ──────────────────────────────────────────────────────────────
  io.on('connection', (socket) => {

    // Authenticate the socket using JWT
    const token = socket.handshake.auth?.token;
    if (!token) {
      socket.disconnect();
      return;
    }

    let userData;
    try {
      userData = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      socket.disconnect();
      return;
    }

    socket.userId   = userData.id;
    socket.username = userData.username;
    console.log(`Socket connected: ${socket.username} (${socket.id})`);

    // ── JOIN MATCHMAKING QUEUE ──────────────────────────────────────────────
    socket.on('join_queue', async (data) => {
      try {
        // Get user's ELO and language from DB
        const result = await db.query(
          `SELECT elo, language FROM users WHERE id = $1`,
          [socket.userId]
        );
        if (result.rows.length === 0) return;

        const { elo, language } = result.rows[0];
        const script = data?.script || '';

        const joined = joinQueue({
          userId:     socket.userId,
          username:   socket.username,
          socketId:   socket.id,
          elo,
          language,
          script,
          scriptName: data?.scriptName || 'unknown',
          rated:      data?.rated !== false,
        });

        if (joined) {
          socket.emit('queue_joined', { position: 1 });
          console.log(`${socket.username} joined queue (ELO: ${elo})`);
        }
      } catch (err) {
        console.error('join_queue error:', err.message);
      }
    });

    // ── LEAVE MATCHMAKING QUEUE ─────────────────────────────────────────────
    socket.on('leave_queue', () => {
      leaveQueue(socket.userId);
      socket.emit('queue_left');
    });

    // ── PYTHON BOT ACTION ───────────────────────────────────────────────────
    // Python bots run in the browser — the client sends the action each blink
    socket.on('bot_action', (data) => {
      const match = getMatchByUserId(socket.userId);
      if (!match) return;

      const slot = match.players.p1.userId === socket.userId ? 'p1' : 'p2';

      if (!match.pendingActions) match.pendingActions = { p1: null, p2: null };
      match.pendingActions[slot] = data.action || { action: 'idle' };
    });

    // ── UPDATE SCRIPT MID-MATCH ─────────────────────────────────────────────
    socket.on('update_script', (data) => {
      if (data?.script) {
        updatePlayerScript(socket.userId, data.script);
        socket.emit('script_updated', { ok: true });
      }
    });

    // ── PLAY WITH A FRIEND ──────────────────────────────────────────────────
    socket.on('invite_friend', async (data) => {
      try {
        const { username, rated } = data;

        // Find the friend's socket
        const friendSocket = findSocketByUsername(io, username);
        if (!friendSocket) {
          socket.emit('invite_error', { error: 'Player not online' });
          return;
        }

        // Send invite to friend
        friendSocket.emit('match_invite', {
          from:  socket.username,
          rated: rated !== false,
        });

        socket.emit('invite_sent', { to: username });
      } catch (err) {
        socket.emit('invite_error', { error: err.message });
      }
    });

    socket.on('accept_invite', async (data) => {
      try {
        const { from, rated } = data;
        const inviterSocket = findSocketByUsername(io, from);
        if (!inviterSocket) {
          socket.emit('invite_error', { error: 'Inviter disconnected' });
          return;
        }

        // Get both players' data
        const [r1, r2] = await Promise.all([
          db.query(`SELECT elo, language FROM users WHERE id = $1`, [inviterSocket.userId]),
          db.query(`SELECT elo, language FROM users WHERE id = $1`, [socket.userId]),
        ]);

        const p1 = {
          userId:   inviterSocket.userId,
          username: inviterSocket.username,
          socketId: inviterSocket.id,
          elo:      r1.rows[0].elo,
          language: r1.rows[0].language,
          script:   '',
          rated:    rated !== false,
        };
        const p2 = {
          userId:   socket.userId,
          username: socket.username,
          socketId: socket.id,
          elo:      r2.rows[0].elo,
          language: r2.rows[0].language,
          script:   '',
          rated:    rated !== false,
        };

        handleMatchFound(io, p1, p2);
      } catch (err) {
        socket.emit('invite_error', { error: err.message });
      }
    });

    socket.on('decline_invite', (data) => {
      const inviterSocket = findSocketByUsername(io, data.from);
      if (inviterSocket) {
        inviterSocket.emit('invite_declined', { by: socket.username });
      }
    });

    // ── DISCONNECTION ───────────────────────────────────────────────────────
    socket.on('disconnect', () => {
      console.log(`Socket disconnected: ${socket.username}`);

      // Remove from queue if waiting
      leaveQueue(socket.userId);

      // If in a match, forfeit
      const match = getMatchByUserId(socket.userId);
      if (match) {
        const slot    = match.players.p1.userId === socket.userId ? 'p1' : 'p2';
        const oppSlot = slot === 'p1' ? 'p2' : 'p1';
        const oppSocketId = match.players[oppSlot].socketId;

        io.to(oppSocketId).emit('opponent_disconnected', {
          winner: oppSlot,
        });

        endMatch(match.id);
      }
    });
  });
}

// ─── HANDLE MATCH FOUND ──────────────────────────────────────────────────────
function handleMatchFound(io, p1Data, p2Data) {
  const match = createMatch(p1Data, p2Data);

  console.log(`Match started: ${p1Data.username} vs ${p2Data.username} (${match.id})`);

  // Tell both players the match is starting
  io.to(p1Data.socketId).emit('match_found', {
    matchId:  match.id,
    slot:     'p1',
    opponent: { username: p2Data.username, elo: p2Data.elo },
    round:    1,
  });
  io.to(p2Data.socketId).emit('match_found', {
    matchId:  match.id,
    slot:     'p2',
    opponent: { username: p1Data.username, elo: p1Data.elo },
    round:    1,
  });

  // Initialize pending actions
  match.pendingActions = { p1: null, p2: null };

  // Start the blink loop
  startGameLoop(match, io);
}

// ─── FIND SOCKET BY USERNAME ─────────────────────────────────────────────────
function findSocketByUsername(io, username) {
  for (const [, socket] of io.sockets.sockets) {
    if (socket.username === username) return socket;
  }
  return null;
}

module.exports = { initSocketHandler };