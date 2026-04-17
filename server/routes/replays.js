const express = require('express');
const router  = express.Router();
const db      = require('../config/db');
const authMiddleware = require('../middleware/auth');

router.use(authMiddleware);

router.get('/:matchId', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT m.id, m.replay_data, m.p1_score, m.p2_score,
              m.created_at,
              u1.username as p1_username,
              u2.username as p2_username
       FROM matches m
       JOIN users u1 ON m.p1_id = u1.id
       JOIN users u2 ON m.p2_id = u2.id
       WHERE m.id = $1`,
      [req.params.matchId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Replay not found' });
    }

    const row = result.rows[0];
    res.json({
      matchId:     req.params.matchId,
      p1Username:  row.p1_username,
      p2Username:  row.p2_username,
      finalScore:  `${row.p1_score}-${row.p2_score}`,
      createdAt:   row.created_at,
      blinkStates: row.replay_data,
    });

  } catch (err) {
    console.error('Replay fetch error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;