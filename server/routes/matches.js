const express = require('express');
const router = express.Router();
const db = require('../config/db');
const authMiddleware = require('../middleware/auth');

// ─── GET MATCH HISTORY ───────────────────────────────────────────────────────
// GET /api/matches
// Returns paginated match history for the authenticated user
router.get('/', authMiddleware, async (req, res) => {
  const userId = req.user.id;
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const offset = (page - 1) * limit;

  try {
    // Get total count for pagination
    const countResult = await db.query(
      `SELECT COUNT(*) as total
       FROM matches
       WHERE player1_id = $1 OR player2_id = $1`,
      [userId]
    );

    const totalMatches = parseInt(countResult.rows[0].total);

    // Get matches with opponent info
    const matchesResult = await db.query(
      `SELECT
        m.id,
        m.created_at,
        m.mode,
        m.final_score,
        m.player1_elo_change,
        m.player2_elo_change,
        m.player1_id,
        m.player2_id,
        m.winner_id,
        u1.username as player1_username,
        u2.username as player2_username,
        CASE
          WHEN m.player1_id = $1 THEN m.player1_elo_change
          WHEN m.player2_id = $1 THEN m.player2_elo_change
          ELSE 0
        END as elo_change,
        CASE
          WHEN m.winner_id = $1 THEN 'win'
          WHEN m.winner_id IS NULL THEN 'draw'
          ELSE 'loss'
        END as result,
        CASE
          WHEN m.player1_id = $1 THEN u2.username
          ELSE u1.username
        END as opponent_username
       FROM matches m
       JOIN users u1 ON m.player1_id = u1.id
       JOIN users u2 ON m.player2_id = u2.id
       WHERE m.player1_id = $1 OR m.player2_id = $1
       ORDER BY m.created_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    );

    const matches = matchesResult.rows.map(match => ({
      id: match.id,
      date: match.created_at,
      mode: match.mode,
      opponent: match.opponent_username,
      result: match.result,
      eloChange: match.elo_change,
      finalScore: match.final_score,
    }));

    res.json({
      matches,
      pagination: {
        page,
        limit,
        total: totalMatches,
        pages: Math.ceil(totalMatches / limit),
      }
    });

  } catch (err) {
    console.error('Match history fetch error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;