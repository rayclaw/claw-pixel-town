-- Migration 001: Initial schema
-- This migration creates the base tables for star-office

CREATE TABLE IF NOT EXISTS join_keys (
    key         TEXT PRIMARY KEY,
    max_concurrent INTEGER NOT NULL DEFAULT 3,
    reusable    BOOLEAN NOT NULL DEFAULT 1,
    expires_at  TEXT,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS agents (
    agent_id    TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    is_main     BOOLEAN NOT NULL DEFAULT 0,
    state       TEXT NOT NULL DEFAULT 'idle',
    detail      TEXT NOT NULL DEFAULT '',
    area        TEXT NOT NULL DEFAULT 'breakroom',
    framework   TEXT NOT NULL DEFAULT 'unknown',
    join_key    TEXT NOT NULL DEFAULT '',
    online      BOOLEAN NOT NULL DEFAULT 1,
    auth_status TEXT NOT NULL DEFAULT 'approved',
    avatar      TEXT NOT NULL DEFAULT 'guest_role_1',
    last_push_at TEXT NOT NULL DEFAULT (datetime('now')),
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_agents_join_key ON agents(join_key);
CREATE INDEX IF NOT EXISTS idx_agents_online ON agents(online);

CREATE TABLE IF NOT EXISTS main_state (
    id          INTEGER PRIMARY KEY CHECK (id = 1),
    state       TEXT NOT NULL DEFAULT 'idle',
    detail      TEXT NOT NULL DEFAULT '',
    progress    INTEGER NOT NULL DEFAULT 0,
    updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO main_state (id) VALUES (1);
