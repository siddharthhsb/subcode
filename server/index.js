const express   = require('express');
const cors      = require('cors');
const dotenv    = require('dotenv');
const http      = require('http');
const { Server } = require('socket.io');

dotenv.config();

const db             = require('./config/db');
const authRoutes     = require('./routes/auth');
const scriptRoutes   = require('./routes/scripts');
const sandboxRoutes  = require('./routes/sandbox');
const replayRoutes = require('./routes/replays');
const leaderboardRoutes = require('./routes/leaderboard');
const authMiddleware = require('./middleware/auth');
const { buildSandboxImage } = require('./sandbox/cSandbox');
const { initSocketHandler } = require('./game/socketHandler');

const app    = express();
const server = http.createServer(app);  // wrap Express in an HTTP server
const io     = new Server(server, {
  cors: {
    origin:      'http://localhost:5173',
    credentials: true,
  },
});

const PORT = process.env.PORT || 4000;

app.use(cors({
  origin: 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json());

// REST routes
app.use('/api/auth',    authRoutes);
app.use('/api/scripts', scriptRoutes);
app.use('/api/sandbox', sandboxRoutes);
app.use('/api/replays', replayRoutes);  
app.use('/api/leaderboard', leaderboardRoutes);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'SubCode server is running' });
});

app.get('/api/protected', authMiddleware, (req, res) => {
  res.json({ message: `Hello ${req.user.username}, you are authenticated!` });
});

// Socket.io
initSocketHandler(io);

// Start server
server.listen(PORT, async () => {
  console.log(`SubCode server running on port ${PORT}`);
  buildSandboxImage().then(ok => {
    if (ok) console.log('C sandbox ready');
    else    console.log('C sandbox unavailable — Docker may not be running');
  });
});
