-- Migration 002: Multi-Channel Support
-- Adds users, bots, channels tables for multi-room architecture

-- Users table (lightweight, token-based)
CREATE TABLE IF NOT EXISTS users (
    user_id     TEXT PRIMARY KEY,
    name        TEXT NOT NULL DEFAULT 'Anonymous',
    avatar      TEXT NOT NULL DEFAULT 'default',
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Bots table (AI agents, platform-unique)
CREATE TABLE IF NOT EXISTS bots (
    bot_id              TEXT PRIMARY KEY,
    name                TEXT NOT NULL,
    owner_user_id       TEXT,
    avatar              TEXT NOT NULL DEFAULT 'bot_default',
    current_channel_id  TEXT,
    current_agent_id    TEXT,
    online              BOOLEAN NOT NULL DEFAULT 0,
    created_at          TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (owner_user_id) REFERENCES users(user_id),
    FOREIGN KEY (current_channel_id) REFERENCES channels(channel_id)
);

CREATE INDEX IF NOT EXISTS idx_bots_owner ON bots(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_bots_channel ON bots(current_channel_id);

-- Channels table
CREATE TABLE IF NOT EXISTS channels (
    channel_id      TEXT PRIMARY KEY,
    name            TEXT NOT NULL,
    owner_user_id   TEXT,
    type            TEXT NOT NULL DEFAULT 'public' CHECK (type IN ('public', 'private')),
    join_key        TEXT,
    whitelist       TEXT NOT NULL DEFAULT '[]',  -- JSON array of botIds
    max_members     INTEGER NOT NULL DEFAULT 20,
    layout          TEXT NOT NULL DEFAULT '{}',  -- JSON blob for OfficeLayout
    is_public       BOOLEAN NOT NULL DEFAULT 1,
    is_default      BOOLEAN NOT NULL DEFAULT 0,
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (owner_user_id) REFERENCES users(user_id)
);

CREATE INDEX IF NOT EXISTS idx_channels_public ON channels(is_public);
CREATE INDEX IF NOT EXISTS idx_channels_default ON channels(is_default);

-- Channel members (tracks bot presence in channels)
CREATE TABLE IF NOT EXISTS channel_members (
    channel_id      TEXT NOT NULL,
    bot_id          TEXT NOT NULL,
    agent_id        TEXT NOT NULL,
    state           TEXT NOT NULL DEFAULT 'idle',
    detail          TEXT NOT NULL DEFAULT '',
    area            TEXT NOT NULL DEFAULT 'breakroom',
    online          BOOLEAN NOT NULL DEFAULT 1,
    last_push_at    TEXT NOT NULL DEFAULT (datetime('now')),
    joined_at       TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (channel_id, bot_id),
    FOREIGN KEY (channel_id) REFERENCES channels(channel_id) ON DELETE CASCADE,
    FOREIGN KEY (bot_id) REFERENCES bots(bot_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_channel_members_online ON channel_members(online);

-- Create default channel for v1 compatibility
INSERT OR IGNORE INTO channels (channel_id, name, type, is_public, is_default, layout)
VALUES ('default', 'Default Office', 'public', 1, 1, '{}');

-- Migrate existing agents to default channel
-- Note: This creates bots for existing agents and links them to the default channel
INSERT OR IGNORE INTO bots (bot_id, name, avatar, current_channel_id, current_agent_id, online, created_at)
SELECT
    'bot_' || agent_id,
    name,
    avatar,
    CASE WHEN online = 1 THEN 'default' ELSE NULL END,
    CASE WHEN online = 1 THEN agent_id ELSE NULL END,
    online,
    created_at
FROM agents
WHERE is_main = 0;

-- Migrate existing agents to channel_members
INSERT OR IGNORE INTO channel_members (channel_id, bot_id, agent_id, state, detail, area, online, last_push_at, joined_at)
SELECT
    'default',
    'bot_' || agent_id,
    agent_id,
    state,
    detail,
    area,
    online,
    last_push_at,
    created_at
FROM agents
WHERE is_main = 0 AND online = 1;
