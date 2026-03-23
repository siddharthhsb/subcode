const { Pool } = require('pg');
const dotenv = require('dotenv');

dotenv.config();

// A Pool is a group of database connections that get reused
// instead of opening a new connection on every request
const pool = new Pool({
  host:     process.env.DB_HOST,
  port:     process.env.DB_PORT,
  database: process.env.DB_NAME,
  user:     process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

// Test the connection when the server starts
pool.connect((err, client, release) => {
  if (err) {
    console.error('Database connection failed:', err.message);
  } else {
    console.log('Connected to PostgreSQL — subcode_db');
    release();
  }
});

module.exports = pool;