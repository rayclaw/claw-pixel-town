-- Migration 005: Game System
-- Adds games, game_players, and game_actions tables for agent interactive games

-- Games table (game instances)
CREATE TABLE IF NOT EXISTS games (
    game_id         TEXT PRIMARY KEY,
    channel_id      TEXT NOT NULL,
    game_type       TEXT NOT NULL CHECK (game_type IN ('rps', 'werewolf', 'poker', 'riddle')),
    status          TEXT NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'playing', 'finished', 'cancelled')),
    config          TEXT NOT NULL DEFAULT '{}',     -- JSON: game-specific config
    state           TEXT NOT NULL DEFAULT '{}',     -- JSON: game state (server-side full view)
    turn_id         INTEGER NOT NULL DEFAULT 0,     -- Incrementing turn counter for validation
    current_phase   TEXT NOT NULL DEFAULT '',       -- Game-specific phase name
    winner_bot_id   TEXT,
    created_by      TEXT NOT NULL,
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    finished_at     TEXT,
    FOREIGN KEY (channel_id) REFERENCES channels(channel_id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES bots(bot_id)
);

CREATE INDEX IF NOT EXISTS idx_games_channel ON games(channel_id);
CREATE INDEX IF NOT EXISTS idx_games_status ON games(status);
CREATE INDEX IF NOT EXISTS idx_games_channel_status ON games(channel_id, status);

-- Game players table (participants in a game)
CREATE TABLE IF NOT EXISTS game_players (
    game_id         TEXT NOT NULL,
    bot_id          TEXT NOT NULL,
    seat_order      INTEGER NOT NULL,
    role            TEXT NOT NULL DEFAULT '',       -- Game-specific role (e.g., werewolf/villager)
    private_state   TEXT NOT NULL DEFAULT '{}',     -- JSON: player's hidden state
    public_state    TEXT NOT NULL DEFAULT '{}',     -- JSON: player's visible state
    score           INTEGER NOT NULL DEFAULT 0,
    is_alive        BOOLEAN NOT NULL DEFAULT 1,     -- For elimination games
    joined_at       TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (game_id, bot_id),
    FOREIGN KEY (game_id) REFERENCES games(game_id) ON DELETE CASCADE,
    FOREIGN KEY (bot_id) REFERENCES bots(bot_id)
);

CREATE INDEX IF NOT EXISTS idx_game_players_bot ON game_players(bot_id);

-- Game actions table (action history for replay/audit)
CREATE TABLE IF NOT EXISTS game_actions (
    action_id       INTEGER PRIMARY KEY AUTOINCREMENT,
    game_id         TEXT NOT NULL,
    turn_id         INTEGER NOT NULL,
    bot_id          TEXT NOT NULL,
    action_type     TEXT NOT NULL,
    action_data     TEXT NOT NULL DEFAULT '{}',     -- JSON: action payload
    result          TEXT NOT NULL DEFAULT '{}',     -- JSON: action result
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (game_id) REFERENCES games(game_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_game_actions_game ON game_actions(game_id);
CREATE INDEX IF NOT EXISTS idx_game_actions_turn ON game_actions(game_id, turn_id);
