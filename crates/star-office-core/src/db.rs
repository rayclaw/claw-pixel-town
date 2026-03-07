use rusqlite::{Connection, params};
use crate::types::*;
use std::sync::Mutex;

pub struct Database {
    conn: Mutex<Connection>,
}

impl Database {
    pub fn new(path: &str) -> Result<Self, rusqlite::Error> {
        let conn = Connection::open(path)?;
        conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;")?;
        let db = Database { conn: Mutex::new(conn) };
        db.migrate()?;
        Ok(db)
    }

    fn migrate(&self) -> Result<(), rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS join_keys (
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

            INSERT OR IGNORE INTO main_state (id) VALUES (1);"
        )?;
        Ok(())
    }

    // --- Main State ---

    pub fn get_main_state(&self) -> Result<MainState, rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        conn.query_row(
            "SELECT state, detail, progress, updated_at FROM main_state WHERE id = 1",
            [],
            |row| {
                let state_str: String = row.get(0)?;
                Ok(MainState {
                    state: AgentState::from_str_normalized(&state_str),
                    detail: row.get(1)?,
                    progress: row.get(2)?,
                    updated_at: row.get(3)?,
                })
            },
        )
    }

    pub fn set_main_state(&self, state: &str, detail: &str) -> Result<(), rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        let normalized = AgentState::from_str_normalized(state);
        let now = chrono::Utc::now().to_rfc3339();
        conn.execute(
            "UPDATE main_state SET state = ?1, detail = ?2, updated_at = ?3 WHERE id = 1",
            params![normalized.to_string(), detail, now],
        )?;
        Ok(())
    }

    // --- Join Keys ---

    pub fn get_join_key(&self, key: &str) -> Result<Option<JoinKey>, rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT key, max_concurrent, reusable, expires_at, created_at FROM join_keys WHERE key = ?1"
        )?;
        let mut rows = stmt.query(params![key])?;
        match rows.next()? {
            Some(row) => Ok(Some(JoinKey {
                key: row.get(0)?,
                max_concurrent: row.get(1)?,
                reusable: row.get(2)?,
                expires_at: row.get(3)?,
                created_at: row.get(4)?,
            })),
            None => Ok(None),
        }
    }

    pub fn upsert_join_key(&self, jk: &JoinKey) -> Result<(), rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO join_keys (key, max_concurrent, reusable, expires_at, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5)
             ON CONFLICT(key) DO UPDATE SET max_concurrent=?2, reusable=?3, expires_at=?4",
            params![jk.key, jk.max_concurrent, jk.reusable, jk.expires_at, jk.created_at],
        )?;
        Ok(())
    }

    pub fn count_online_agents_by_key(&self, key: &str) -> Result<u32, rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        conn.query_row(
            "SELECT COUNT(*) FROM agents WHERE join_key = ?1 AND online = 1",
            params![key],
            |row| row.get(0),
        )
    }

    // --- Agents ---

    pub fn insert_agent(&self, agent: &Agent) -> Result<(), rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO agents (agent_id, name, is_main, state, detail, area, framework, join_key, online, auth_status, avatar, last_push_at, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)",
            params![
                agent.agent_id, agent.name, agent.is_main,
                agent.state.to_string(), agent.detail, agent.area.to_string(),
                agent.framework, agent.join_key, agent.online,
                agent.auth_status, agent.avatar, agent.last_push_at, agent.created_at,
            ],
        )?;
        Ok(())
    }

    pub fn get_agent(&self, agent_id: &str) -> Result<Option<Agent>, rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT agent_id, name, is_main, state, detail, area, framework, join_key, online, auth_status, avatar, last_push_at, created_at
             FROM agents WHERE agent_id = ?1"
        )?;
        let mut rows = stmt.query(params![agent_id])?;
        match rows.next()? {
            Some(row) => {
                let state_str: String = row.get(3)?;
                let area_str: String = row.get(5)?;
                Ok(Some(Agent {
                    agent_id: row.get(0)?,
                    name: row.get(1)?,
                    is_main: row.get(2)?,
                    state: AgentState::from_str_normalized(&state_str),
                    detail: row.get(4)?,
                    area: match area_str.as_str() {
                        "writing" => Area::Writing,
                        "error" => Area::Error,
                        _ => Area::Breakroom,
                    },
                    framework: row.get(6)?,
                    join_key: row.get(7)?,
                    online: row.get(8)?,
                    auth_status: row.get(9)?,
                    avatar: row.get(10)?,
                    last_push_at: row.get(11)?,
                    created_at: row.get(12)?,
                }))
            }
            None => Ok(None),
        }
    }

    pub fn get_all_agents(&self) -> Result<Vec<Agent>, rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT agent_id, name, is_main, state, detail, area, framework, join_key, online, auth_status, avatar, last_push_at, created_at
             FROM agents ORDER BY created_at ASC"
        )?;
        let rows = stmt.query_map([], |row| {
            let state_str: String = row.get(3)?;
            let area_str: String = row.get(5)?;
            Ok(Agent {
                agent_id: row.get(0)?,
                name: row.get(1)?,
                is_main: row.get(2)?,
                state: AgentState::from_str_normalized(&state_str),
                detail: row.get(4)?,
                area: match area_str.as_str() {
                    "writing" => Area::Writing,
                    "error" => Area::Error,
                    _ => Area::Breakroom,
                },
                framework: row.get(6)?,
                join_key: row.get(7)?,
                online: row.get(8)?,
                auth_status: row.get(9)?,
                avatar: row.get(10)?,
                last_push_at: row.get(11)?,
                created_at: row.get(12)?,
            })
        })?;
        rows.collect()
    }

    pub fn update_agent_state(&self, agent_id: &str, state: AgentState, detail: &str) -> Result<bool, rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        let now = chrono::Utc::now().to_rfc3339();
        let area = state.area();
        let changed = conn.execute(
            "UPDATE agents SET state = ?1, detail = ?2, area = ?3, last_push_at = ?4, online = 1, auth_status = 'approved' WHERE agent_id = ?5",
            params![state.to_string(), detail, area.to_string(), now, agent_id],
        )?;
        Ok(changed > 0)
    }

    /// Update state for all online non-main agents
    pub fn broadcast_agent_state(&self, state: AgentState, detail: &str) -> Result<u64, rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        let now = chrono::Utc::now().to_rfc3339();
        let area = state.area();
        let changed = conn.execute(
            "UPDATE agents SET state = ?1, detail = ?2, area = ?3, last_push_at = ?4
             WHERE is_main = 0 AND online = 1",
            params![state.to_string(), detail, area.to_string(), now],
        )?;
        Ok(changed as u64)
    }

    pub fn remove_agent(&self, agent_id: &str) -> Result<bool, rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        let changed = conn.execute("DELETE FROM agents WHERE agent_id = ?1", params![agent_id])?;
        Ok(changed > 0)
    }

    pub fn mark_idle_expired(&self, ttl_secs: i64) -> Result<u64, rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        let cutoff = (chrono::Utc::now() - chrono::Duration::seconds(ttl_secs)).to_rfc3339();
        let changed = conn.execute(
            "UPDATE agents SET state = 'idle', area = 'breakroom'
             WHERE state NOT IN ('idle', 'error') AND last_push_at < ?1 AND online = 1",
            params![cutoff],
        )?;
        Ok(changed as u64)
    }

    pub fn mark_offline_expired(&self, ttl_secs: i64) -> Result<u64, rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        let cutoff = (chrono::Utc::now() - chrono::Duration::seconds(ttl_secs)).to_rfc3339();
        let changed = conn.execute(
            "UPDATE agents SET online = 0, auth_status = 'offline'
             WHERE online = 1 AND is_main = 0 AND last_push_at < ?1",
            params![cutoff],
        )?;
        Ok(changed as u64)
    }

    /// Ensure the main "star" agent exists
    pub fn ensure_main_agent(&self, name: &str) -> Result<(), rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        let now = chrono::Utc::now().to_rfc3339();
        conn.execute(
            "INSERT OR IGNORE INTO agents (agent_id, name, is_main, state, detail, area, framework, join_key, online, auth_status, avatar, last_push_at, created_at)
             VALUES ('star', ?1, 1, 'idle', '', 'breakroom', 'local', '', 1, 'approved', 'star', ?2, ?2)",
            params![name, now],
        )?;
        Ok(())
    }

    /// Sync main agent state from the main_state table
    pub fn sync_main_agent_state(&self) -> Result<(), rusqlite::Error> {
        let main = self.get_main_state()?;
        let conn = self.conn.lock().unwrap();
        let now = chrono::Utc::now().to_rfc3339();
        conn.execute(
            "UPDATE agents SET state = ?1, area = ?2, detail = ?3, last_push_at = ?4 WHERE agent_id = 'star'",
            params![main.state.to_string(), main.state.area().to_string(), main.detail, now],
        )?;
        Ok(())
    }
}
