const express = require('express');
const router  = express.Router();
const db      = require('../config/db');
const authMiddleware = require('../middleware/auth');

router.use(authMiddleware);

// GET /api/matches — paginated match history for logged-in user
router.get('/', async (req, res) => {
  const page  = parseInt(req.query.page) || 1;
  const limit = 20;
  const offset = (page - 1) * limit;

  try {
    const result = await db.query(
      `SELECT
         m.id,
         m.final_score,
         m.mode,
         m.created_at,
         m.player1_elo_before,
         m.player2_elo_before,
         m.player1_elo_after,
         m.player2_elo_after,
         m.player1_elo_change,
         m.player2_elo_change,
         m.winner_id,
         u1.username as p1_username,
         u2.username as p2_username,
         CASE WHEN m.player1_id = $1 THEN 'p1' ELSE 'p2' END as my_slot
       FROM matches m
       JOIN users u1 ON m.player1_id = u1.id
       JOIN users u2 ON m.player2_id = u2.id
       WHERE m.player1_id = $1 OR m.player2_id = $1
       ORDER BY m.created_at DESC
       LIMIT $2 OFFSET $3`,
      [req.user.id, limit, offset]
    );

    res.json({ matches: result.rows, page, limit });
  } catch (err) {
    console.error('Matches error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;