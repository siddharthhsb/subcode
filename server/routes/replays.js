const express = require('express');
const router  = express.Router();
const db      = require('../config/db');
const authMiddleware = require('../middleware/auth');

router.use(authMiddleware);

// GET /api/replays/:matchId
router.get('/:matchId', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT r.blink_states, m.player1_id, m.player2_id,
              m.final_score, m.created_at,
              u1.username as p1_username,
              u2.username as p2_username
       FROM replays r
       JOIN matches m ON r.match_id = m.id
       JOIN users u1  ON m.player1_id = u1.id
       JOIN users u2  ON m.player2_id = u2.id
       WHERE r.match_id = $1`,
      [req.params.matchId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Replay not found' });
    }

    const row = result.rows[0];
    res.json({
      matchId:    req.params.matchId,
      p1Username: row.p1_username,
      p2Username: row.p2_username,
      finalScore: row.final_score,
      createdAt:  row.created_at,
      blinkStates: row.blink_states,
    });

  } catch (err) {
    console.error('Replay fetch error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;