const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const db = require('../config/db');

// ─── REGISTER ────────────────────────────────────────────────────────────────
// POST /api/auth/register
// Creates a new user account
router.post('/register', async (req, res) => {
  const { username, email, password } = req.body;

  // Basic validation — make sure nothing is empty
  if (!username || !email || !password) {
    return res.status(400).json({ error: 'Username, email and password are required' });
  }

  if (username.length < 3 || username.length > 30) {
    return res.status(400).json({ error: 'Username must be 3–30 characters' });
  }

  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }

  try {
    // Hash the password — bcrypt scrambles it so we never store the real password
    // The number 10 is the "salt rounds" — higher = more secure but slower
    const password_hash = await bcrypt.hash(password, 10);

    // Insert the new user into the database
    const result = await db.query(
      `INSERT INTO users (username, email, password_hash)
       VALUES ($1, $2, $3)
       RETURNING id, username, email, elo, language`,
      [username, email, password_hash]
    );

    const user = result.rows[0];

    // Also create their leaderboard entry
    await db.query(
      `INSERT INTO leaderboard (user_id, username, elo) VALUES ($1, $2, $3)`,
      [user.id, user.username, 1000]
    );

    // Create a JWT token — this is what the browser stores to stay logged in
    const token = jwt.sign(
      { id: user.id, username: user.username },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({
      message: 'Account created successfully',
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        elo: user.elo,
        language: user.language,
      }
    });

  } catch (err) {
    // PostgreSQL error code 23505 = unique constraint violation
    // This means the username or email is already taken
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Username or email already taken' });
    }
    console.error('Register error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── LOGIN ────────────────────────────────────────────────────────────────────
// POST /api/auth/login
// Logs in an existing user and returns a JWT token
router.post('/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  try {
    // Look up the user by username
    const result = await db.query(
      `SELECT * FROM users WHERE username = $1`,
      [username]
    );

    if (result.rows.length === 0) {
      // Don't say "user not found" — say "invalid credentials" for security
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    const user = result.rows[0];

    // Compare the submitted password against the stored hash
    const passwordMatch = await bcrypt.compare(password, user.password_hash);

    if (!passwordMatch) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    // Password matches — create a JWT token
    const token = jwt.sign(
      { id: user.id, username: user.username },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        elo: user.elo,
        language: user.language,
      }
    });

  } catch (err) {
    console.error('Login error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;