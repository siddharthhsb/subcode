const express = require('express');
const router  = express.Router();
const db      = require('../config/db');
const authMiddleware = require('../middleware/auth');

// GET /api/leaderboard
router.get('/', authMiddleware, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT
         ROW_NUMBER() OVER (ORDER BY l.elo DESC) as rank,
         u.username,
         u.language,
         l.elo,
         l.wins,
         l.losses,
         l.draws,
         u.matches_played,
         u.id as user_id
       FROM leaderboard l
       JOIN users u ON l.user_id = u.id
       ORDER BY l.elo DESC
       LIMIT 100`
    );
    res.json({ leaderboard: result.rows });
  } catch (err) {
    console.error('Leaderboard error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;