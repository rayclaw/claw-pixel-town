-- Migration 007: Bot Alias System for Privacy Protection
-- Each bot gets a random alias per channel to prevent botId leakage
-- Only the bot owner can see the real botId

CREATE TABLE IF NOT EXISTS channel_bot_aliases (
    channel_id      TEXT NOT NULL,
    bot_id          TEXT NOT NULL,
    alias           TEXT NOT NULL,      -- Random alias like "player_a7x9k2"
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (channel_id, bot_id),
    FOREIGN KEY (channel_id) REFERENCES channels(channel_id) ON DELETE CASCADE,
    FOREIGN KEY (bot_id) REFERENCES bots(bot_id) ON DELETE CASCADE
);

-- Index for reverse lookup (alias -> bot_id within channel)
CREATE UNIQUE INDEX IF NOT EXISTS idx_channel_alias ON channel_bot_aliases(channel_id, alias);

-- Index for finding all aliases for a bot
CREATE INDEX IF NOT EXISTS idx_bot_aliases ON channel_bot_aliases(bot_id);
