const express = require('express');
const router  = express.Router();
const authMiddleware = require('../middleware/auth');
const { compileCCode } = require('../sandbox/cSandbox');

// All sandbox routes require authentication
router.use(authMiddleware);

// ─── COMPILE C CODE ───────────────────────────────────────────────────────────
// POST /api/sandbox/compile
// Body: { code: string }
// Returns: { success, errors? }
router.post('/compile', async (req, res) => {
  const { code } = req.body;

  if (!code) {
    return res.status(400).json({ error: 'No code provided' });
  }

  // Basic size check — reject obviously malicious payloads
  if (code.length > 50000) {
    return res.status(400).json({ error: 'Code too large (max 50KB)' });
  }

  try {
    const result = await compileCCode(code, req.user.id);

    if (result.success) {
      // Store the binary path on the user's session
      // (in a real match this is handled by the game session manager)
      res.json({
        success: true,
        message: 'Compiled successfully',
        binaryPath: result.binaryPath,
        tmpDir: result.tmpDir,
      });
    } else {
      res.json({
        success: false,
        errors: result.errors,
      });
    }
  } catch (err) {
    console.error('Compile error:', err.message);
    res.status(500).json({ error: 'Compilation failed' });
  }
});

module.exports = router;