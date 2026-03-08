use rusqlite::{Connection, params};
use crate::types::*;
use crate::migrations;
use std::sync::{Arc, Mutex, PoisonError};

/// Database error type
#[derive(Debug)]
pub enum DbError {
    Sqlite(rusqlite::Error),
    LockPoisoned,
    SpawnBlocking,
}

impl std::fmt::Display for DbError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            DbError::Sqlite(e) => write!(f, "SQLite error: {}", e),
            DbError::LockPoisoned => write!(f, "Database lock poisoned"),
            DbError::SpawnBlocking => write!(f, "spawn_blocking task failed"),
        }
    }
}

impl std::error::Error for DbError {}

impl From<rusqlite::Error> for DbError {
    fn from(e: rusqlite::Error) -> Self {
        DbError::Sqlite(e)
    }
}

impl<T> From<PoisonError<T>> for DbError {
    fn from(_: PoisonError<T>) -> Self {
        DbError::LockPoisoned
    }
}

/// Thread-safe database wrapper
#[derive(Clone)]
pub struct Database {
    conn: Arc<Mutex<Connection>>,
}

impl Database {
    pub fn new(path: &str) -> Result<Self, DbError> {
        let conn = Connection::open(path)?;
        conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;")?;

        // Run migrations
        migrations::run_migrations(&conn)
            .map_err(|e| DbError::Sqlite(rusqlite::Error::ToSqlConversionFailure(Box::new(e))))?;

        let db = Database { conn: Arc::new(Mutex::new(conn)) };
        Ok(db)
    }

    // --- Main State ---

    pub fn get_main_state(&self) -> Result<MainState, DbError> {
        let conn = self.conn.lock()?;
        let result = conn.query_row(
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
        )?;
        Ok(result)
    }

    pub fn set_main_state(&self, state: &str, detail: &str) -> Result<(), DbError> {
        let conn = self.conn.lock()?;
        let normalized = AgentState::from_str_normalized(state);
        let now = chrono::Utc::now().to_rfc3339();
        conn.execute(
            "UPDATE main_state SET state = ?1, detail = ?2, updated_at = ?3 WHERE id = 1",
            params![normalized.to_string(), detail, now],
        )?;
        Ok(())
    }

    // --- Join Keys ---

    pub fn get_join_key(&self, key: &str) -> Result<Option<JoinKey>, DbError> {
        let conn = self.conn.lock()?;
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

    pub fn upsert_join_key(&self, jk: &JoinKey) -> Result<(), DbError> {
        let conn = self.conn.lock()?;
        conn.execute(
            "INSERT INTO join_keys (key, max_concurrent, reusable, expires_at, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5)
             ON CONFLICT(key) DO UPDATE SET max_concurrent=?2, reusable=?3, expires_at=?4",
            params![jk.key, jk.max_concurrent, jk.reusable, jk.expires_at, jk.created_at],
        )?;
        Ok(())
    }

    pub fn count_online_agents_by_key(&self, key: &str) -> Result<u32, DbError> {
        let conn = self.conn.lock()?;
        let count = conn.query_row(
            "SELECT COUNT(*) FROM agents WHERE join_key = ?1 AND online = 1",
            params![key],
            |row| row.get(0),
        )?;
        Ok(count)
    }

    // --- Agents ---

    pub fn insert_agent(&self, agent: &Agent) -> Result<(), DbError> {
        let conn = self.conn.lock()?;
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

    pub fn get_agent(&self, agent_id: &str) -> Result<Option<Agent>, DbError> {
        let conn = self.conn.lock()?;
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

    pub fn get_all_agents(&self) -> Result<Vec<Agent>, DbError> {
        let conn = self.conn.lock()?;
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
        rows.collect::<Result<Vec<_>, _>>().map_err(DbError::from)
    }

    pub fn update_agent_state(&self, agent_id: &str, state: AgentState, detail: &str) -> Result<bool, DbError> {
        let conn = self.conn.lock()?;
        let now = chrono::Utc::now().to_rfc3339();
        let area = state.area();
        let changed = conn.execute(
            "UPDATE agents SET state = ?1, detail = ?2, area = ?3, last_push_at = ?4, online = 1, auth_status = 'approved' WHERE agent_id = ?5",
            params![state.to_string(), detail, area.to_string(), now, agent_id],
        )?;
        Ok(changed > 0)
    }

    /// Update state for all online non-main agents
    pub fn broadcast_agent_state(&self, state: AgentState, detail: &str) -> Result<u64, DbError> {
        let conn = self.conn.lock()?;
        let now = chrono::Utc::now().to_rfc3339();
        let area = state.area();
        let changed = conn.execute(
            "UPDATE agents SET state = ?1, detail = ?2, area = ?3, last_push_at = ?4
             WHERE is_main = 0 AND online = 1",
            params![state.to_string(), detail, area.to_string(), now],
        )?;
        Ok(changed as u64)
    }

    pub fn remove_agent(&self, agent_id: &str) -> Result<bool, DbError> {
        let conn = self.conn.lock()?;
        let changed = conn.execute("DELETE FROM agents WHERE agent_id = ?1", params![agent_id])?;
        Ok(changed > 0)
    }

    pub fn mark_idle_expired(&self, ttl_secs: i64) -> Result<u64, DbError> {
        let conn = self.conn.lock()?;
        let cutoff = (chrono::Utc::now() - chrono::Duration::seconds(ttl_secs)).to_rfc3339();
        let changed = conn.execute(
            "UPDATE agents SET state = 'idle', area = 'breakroom'
             WHERE state NOT IN ('idle', 'error') AND last_push_at < ?1 AND online = 1",
            params![cutoff],
        )?;
        Ok(changed as u64)
    }

    pub fn mark_offline_expired(&self, ttl_secs: i64) -> Result<u64, DbError> {
        let conn = self.conn.lock()?;
        let cutoff = (chrono::Utc::now() - chrono::Duration::seconds(ttl_secs)).to_rfc3339();
        let changed = conn.execute(
            "UPDATE agents SET online = 0, auth_status = 'offline'
             WHERE online = 1 AND is_main = 0 AND last_push_at < ?1",
            params![cutoff],
        )?;
        Ok(changed as u64)
    }

    /// Ensure the main "star" agent exists
    pub fn ensure_main_agent(&self, name: &str) -> Result<(), DbError> {
        let conn = self.conn.lock()?;
        let now = chrono::Utc::now().to_rfc3339();
        conn.execute(
            "INSERT OR IGNORE INTO agents (agent_id, name, is_main, state, detail, area, framework, join_key, online, auth_status, avatar, last_push_at, created_at)
             VALUES ('star', ?1, 1, 'idle', '', 'breakroom', 'local', '', 1, 'approved', 'star', ?2, ?2)",
            params![name, now],
        )?;
        Ok(())
    }

    /// Sync main agent state from the main_state table
    pub fn sync_main_agent_state(&self) -> Result<(), DbError> {
        let main = self.get_main_state()?;
        let conn = self.conn.lock()?;
        let now = chrono::Utc::now().to_rfc3339();
        conn.execute(
            "UPDATE agents SET state = ?1, area = ?2, detail = ?3, last_push_at = ?4 WHERE agent_id = 'star'",
            params![main.state.to_string(), main.state.area().to_string(), main.detail, now],
        )?;
        Ok(())
    }
}

// --- Async wrappers using spawn_blocking ---

impl Database {
    /// Async wrapper for get_main_state
    pub async fn get_main_state_async(&self) -> Result<MainState, DbError> {
        let db = self.clone();
        tokio::task::spawn_blocking(move || db.get_main_state())
            .await
            .map_err(|_| DbError::SpawnBlocking)?
    }

    /// Async wrapper for set_main_state
    pub async fn set_main_state_async(&self, state: String, detail: String) -> Result<(), DbError> {
        let db = self.clone();
        tokio::task::spawn_blocking(move || db.set_main_state(&state, &detail))
            .await
            .map_err(|_| DbError::SpawnBlocking)?
    }

    /// Async wrapper for get_join_key
    pub async fn get_join_key_async(&self, key: String) -> Result<Option<JoinKey>, DbError> {
        let db = self.clone();
        tokio::task::spawn_blocking(move || db.get_join_key(&key))
            .await
            .map_err(|_| DbError::SpawnBlocking)?
    }

    /// Async wrapper for count_online_agents_by_key
    pub async fn count_online_agents_by_key_async(&self, key: String) -> Result<u32, DbError> {
        let db = self.clone();
        tokio::task::spawn_blocking(move || db.count_online_agents_by_key(&key))
            .await
            .map_err(|_| DbError::SpawnBlocking)?
    }

    /// Async wrapper for insert_agent
    pub async fn insert_agent_async(&self, agent: Agent) -> Result<(), DbError> {
        let db = self.clone();
        tokio::task::spawn_blocking(move || db.insert_agent(&agent))
            .await
            .map_err(|_| DbError::SpawnBlocking)?
    }

    /// Async wrapper for get_agent
    pub async fn get_agent_async(&self, agent_id: String) -> Result<Option<Agent>, DbError> {
        let db = self.clone();
        tokio::task::spawn_blocking(move || db.get_agent(&agent_id))
            .await
            .map_err(|_| DbError::SpawnBlocking)?
    }

    /// Async wrapper for get_all_agents
    pub async fn get_all_agents_async(&self) -> Result<Vec<Agent>, DbError> {
        let db = self.clone();
        tokio::task::spawn_blocking(move || db.get_all_agents())
            .await
            .map_err(|_| DbError::SpawnBlocking)?
    }

    /// Async wrapper for update_agent_state
    pub async fn update_agent_state_async(&self, agent_id: String, state: AgentState, detail: String) -> Result<bool, DbError> {
        let db = self.clone();
        tokio::task::spawn_blocking(move || db.update_agent_state(&agent_id, state, &detail))
            .await
            .map_err(|_| DbError::SpawnBlocking)?
    }

    /// Async wrapper for broadcast_agent_state
    pub async fn broadcast_agent_state_async(&self, state: AgentState, detail: String) -> Result<u64, DbError> {
        let db = self.clone();
        tokio::task::spawn_blocking(move || db.broadcast_agent_state(state, &detail))
            .await
            .map_err(|_| DbError::SpawnBlocking)?
    }

    /// Async wrapper for remove_agent
    pub async fn remove_agent_async(&self, agent_id: String) -> Result<bool, DbError> {
        let db = self.clone();
        tokio::task::spawn_blocking(move || db.remove_agent(&agent_id))
            .await
            .map_err(|_| DbError::SpawnBlocking)?
    }
}
