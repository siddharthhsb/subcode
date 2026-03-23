const jwt = require('jsonwebtoken');

// This function runs before any protected route handler
// It checks the request for a valid JWT token
function authMiddleware(req, res, next) {

  // The token arrives in the request header like this:
  // Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
  const authHeader = req.headers['authorization'];

  if (!authHeader) {
    return res.status(401).json({ error: 'No token provided' });
  }

  // Split "Bearer <token>" and grab just the token part
  const token = authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Malformed token' });
  }

  try {
    // Verify the token using the same secret we used to sign it
    // If it's valid, decoded will contain { id, username }
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Attach the user info to the request so route handlers can use it
    req.user = decoded;

    // Call next() to pass the request on to the actual route handler
    next();

  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

module.exports = authMiddleware;