const express = require('express');
const router  = express.Router();
const db      = require('../config/db');
const authMiddleware = require('../middleware/auth');

router.use(authMiddleware);

// GET /api/profile/:username
router.get('/:username', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT u.id, u.username, u.language, u.elo,
              u.wins, u.losses, u.draws, u.matches_played,
              u.created_at
       FROM users u
       WHERE u.username = $1`,
      [req.params.username]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Player not found' });
    }
    res.json({ profile: result.rows[0] });
  } catch (err) {
    console.error('Profile error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;