const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');

// Load environment variables from .env file
dotenv.config();

const db = require('./config/db');
const authRoutes = require('./routes/auth');
const authMiddleware = require('./middleware/auth');

const app = express();
const PORT = process.env.PORT || 4000;

// Middleware — these run on every request before your routes
app.use(cors({
  origin: 'http://localhost:5173',
  credentials: true,
}));                // Allow requests from your React frontend
app.use(express.json());          // Parse incoming JSON request bodies

// Routes
app.use('/api/auth', authRoutes);

// Health check route — lets you confirm the server is running
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'SubCode server is running' });
});

// Protected test route — requires a valid JWT token
app.get('/api/protected', authMiddleware, (req, res) => {
  res.json({ message: `Hello ${req.user.username}, you are authenticated!` });
});

// Start the server
app.listen(PORT, () => {
  console.log(`SubCode server running on port ${PORT}`);
});
