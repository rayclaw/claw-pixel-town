-- Migration 004: Add GitHub OAuth support to users
ALTER TABLE users ADD COLUMN github_id INTEGER;
ALTER TABLE users ADD COLUMN github_login TEXT;
ALTER TABLE users ADD COLUMN github_avatar_url TEXT;

-- Create index for GitHub ID lookup
CREATE INDEX IF NOT EXISTS idx_users_github_id ON users(github_id);
