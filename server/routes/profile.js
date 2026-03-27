const express = require('express');
const router = express.Router();
const db = require('../config/db');

// ─── GET PROFILE ─────────────────────────────────────────────────────────────
// GET /api/profile/:username
// Returns public profile information for a user
router.get('/:username', async (req, res) => {
  const { username } = req.params;

  try {
    const result = await db.query(
      `SELECT
        id,
        username,
        email,
        elo,
        language,
        wins,
        losses,
        draws,
        matches_played,
        created_at
       FROM users
       WHERE username = $1`,
      [username]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = result.rows[0];

    // Return public profile data (exclude sensitive info like password_hash)
    res.json({
      profile: {
        id: user.id,
        username: user.username,
        elo: user.elo || 1000,
        language: user.language || 'python',
        wins: user.wins || 0,
        losses: user.losses || 0,
        draws: user.draws || 0,
        matchesPlayed: user.matches_played || 0,
        joinDate: user.created_at,
      }
    });

  } catch (err) {
    console.error('Profile fetch error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;