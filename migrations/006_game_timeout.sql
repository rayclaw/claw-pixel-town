-- Migration 006: Add phase_started_at for game timeout tracking
-- SQLite doesn't allow dynamic defaults on ALTER TABLE, so use a constant

ALTER TABLE games ADD COLUMN phase_started_at TEXT NOT NULL DEFAULT '1970-01-01T00:00:00Z';

-- Update existing games to use created_at as phase_started_at
UPDATE games SET phase_started_at = created_at WHERE phase_started_at = '1970-01-01T00:00:00Z';
