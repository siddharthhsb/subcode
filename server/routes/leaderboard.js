const express = require('express');
const router = express.Router();
const db = require('../config/db');

// ─── GET LEADERBOARD ─────────────────────────────────────────────────────────
// GET /api/leaderboard
// Returns the top players by ELO, with their stats
router.get('/', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT 
        u.username,
        l.elo,
        u.wins,
        u.losses,
        u.draws,
        u.matches_played
       FROM leaderboard l
       JOIN users u ON l.user_id = u.id
       ORDER BY l.elo DESC
       LIMIT 100`
    );

    // Add rank to each player
    const leaderboard = result.rows.map((player, index) => ({
      rank: index + 1,
      username: player.username,
      elo: player.elo,
      wins: player.wins || 0,
      losses: player.losses || 0,
      draws: player.draws || 0,
      matchesPlayed: player.matches_played || 0,
    }));

    res.json({ leaderboard });
  } catch (err) {
    console.error('Leaderboard fetch error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;