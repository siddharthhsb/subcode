const express = require('express');
const router = express.Router();
const db = require('../config/db');
const authMiddleware = require('../middleware/auth');

// All script routes require authentication
router.use(authMiddleware);

// ─── GET ALL SCRIPTS ─────────────────────────────────────────────────────────
// GET /api/scripts
// Returns all scripts belonging to the logged-in user
router.get('/', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT id, name, language, created_at, updated_at
       FROM scripts
       WHERE user_id = $1
       ORDER BY updated_at DESC`,
      [req.user.id]
    );
    res.json({ scripts: result.rows });
  } catch (err) {
    console.error('Get scripts error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── GET SINGLE SCRIPT ───────────────────────────────────────────────────────
// GET /api/scripts/:id
// Returns the full code of one script
router.get('/:id', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT * FROM scripts WHERE id = $1 AND user_id = $2`,
      [req.params.id, req.user.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Script not found' });
    }
    res.json({ script: result.rows[0] });
  } catch (err) {
    console.error('Get script error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── CREATE SCRIPT ───────────────────────────────────────────────────────────
// POST /api/scripts
// Saves a new named script
router.post('/', async (req, res) => {
  const { name, language, code } = req.body;

  if (!name || !language || !code) {
    return res.status(400).json({ error: 'Name, language, and code are required' });
  }

  if (!['python', 'c'].includes(language)) {
    return res.status(400).json({ error: 'Language must be python or c' });
  }

  try {
    const result = await db.query(
      `INSERT INTO scripts (user_id, name, language, code)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [req.user.id, name, language, code]
    );
    res.status(201).json({ script: result.rows[0] });
  } catch (err) {
    console.error('Create script error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── UPDATE SCRIPT ───────────────────────────────────────────────────────────
// PUT /api/scripts/:id
// Overwrites an existing script's code
router.put('/:id', async (req, res) => {
  const { name, code } = req.body;

  try {
    const result = await db.query(
      `UPDATE scripts
       SET name = COALESCE($1, name),
           code = COALESCE($2, code),
           updated_at = NOW()
       WHERE id = $3 AND user_id = $4
       RETURNING *`,
      [name, code, req.params.id, req.user.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Script not found' });
    }
    res.json({ script: result.rows[0] });
  } catch (err) {
    console.error('Update script error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── DELETE SCRIPT ───────────────────────────────────────────────────────────
// DELETE /api/scripts/:id
router.delete('/:id', async (req, res) => {
  try {
    const result = await db.query(
      `DELETE FROM scripts WHERE id = $1 AND user_id = $2 RETURNING id`,
      [req.params.id, req.user.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Script not found' });
    }
    res.json({ message: 'Script deleted' });
  } catch (err) {
    console.error('Delete script error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;