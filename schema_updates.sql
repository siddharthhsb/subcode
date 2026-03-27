-- Add missing columns to users table for ELO system
ALTER TABLE users ADD COLUMN IF NOT EXISTS wins INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS losses INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS draws INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS matches_played INTEGER DEFAULT 0;

-- Add ELO change columns to matches table
ALTER TABLE matches ADD COLUMN IF NOT EXISTS player1_elo_change INTEGER DEFAULT 0;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS player2_elo_change INTEGER DEFAULT 0;

-- Ensure leaderboard table exists and has correct structure
-- (This should already exist from the register process)