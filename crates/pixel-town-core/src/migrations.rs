use rusqlite::{Connection, params};
use std::path::Path;
use std::fs;

/// Embedded migrations (compiled into binary)
const MIGRATIONS: &[(&str, &str)] = &[
    ("001_init", include_str!("../../../migrations/001_init.sql")),
    ("002_channels", include_str!("../../../migrations/002_channels.sql")),
    ("003_thumbnails", include_str!("../../../migrations/003_thumbnails.sql")),
    ("004_github_oauth", include_str!("../../../migrations/004_github_oauth.sql")),
    ("005_games", include_str!("../../../migrations/005_games.sql")),
    ("006_game_timeout", include_str!("../../../migrations/006_game_timeout.sql")),
    ("007_bot_aliases", include_str!("../../../migrations/007_bot_aliases.sql")),
];

/// Error type for migration operations
#[derive(Debug)]
pub enum MigrationError {
    Sqlite(rusqlite::Error),
    Io(std::io::Error),
    InvalidVersion(String),
}

impl std::fmt::Display for MigrationError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            MigrationError::Sqlite(e) => write!(f, "SQLite error: {}", e),
            MigrationError::Io(e) => write!(f, "IO error: {}", e),
            MigrationError::InvalidVersion(v) => write!(f, "Invalid migration version: {}", v),
        }
    }
}

impl std::error::Error for MigrationError {}

impl From<rusqlite::Error> for MigrationError {
    fn from(e: rusqlite::Error) -> Self {
        MigrationError::Sqlite(e)
    }
}

impl From<std::io::Error> for MigrationError {
    fn from(e: std::io::Error) -> Self {
        MigrationError::Io(e)
    }
}

/// Initialize the schema_version table
fn ensure_schema_version_table(conn: &Connection) -> Result<(), MigrationError> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS schema_version (
            version     INTEGER PRIMARY KEY,
            name        TEXT NOT NULL,
            applied_at  TEXT NOT NULL DEFAULT (datetime('now'))
        );"
    )?;
    Ok(())
}

/// Get the current schema version
pub fn get_current_version(conn: &Connection) -> Result<i32, MigrationError> {
    ensure_schema_version_table(conn)?;
    let version: i32 = conn.query_row(
        "SELECT COALESCE(MAX(version), 0) FROM schema_version",
        [],
        |row| row.get(0),
    )?;
    Ok(version)
}

/// Run all pending migrations
pub fn run_migrations(conn: &Connection) -> Result<u32, MigrationError> {
    ensure_schema_version_table(conn)?;

    let current = get_current_version(conn)?;
    let mut applied = 0u32;

    for (name, sql) in MIGRATIONS {
        // Extract version number from name (e.g., "001_init" -> 1)
        let version: i32 = name.split('_')
            .next()
            .and_then(|v| v.parse().ok())
            .ok_or_else(|| MigrationError::InvalidVersion(name.to_string()))?;

        if version > current {
            tracing::info!("Applying migration {}: {}", version, name);

            // Execute migration in a transaction
            conn.execute_batch(sql)?;

            // Record the migration
            conn.execute(
                "INSERT INTO schema_version (version, name) VALUES (?1, ?2)",
                params![version, name],
            )?;

            applied += 1;
            tracing::info!("Migration {} applied successfully", version);
        }
    }

    if applied > 0 {
        tracing::info!("Applied {} migration(s), now at version {}", applied, get_current_version(conn)?);
    } else {
        tracing::debug!("No pending migrations, schema at version {}", current);
    }

    Ok(applied)
}

/// Run migrations from a directory (for development/external migrations)
pub fn run_migrations_from_dir(conn: &Connection, dir: &Path) -> Result<u32, MigrationError> {
    ensure_schema_version_table(conn)?;

    let current = get_current_version(conn)?;
    let mut applied = 0u32;

    if !dir.exists() {
        tracing::debug!("Migrations directory does not exist: {:?}", dir);
        return Ok(0);
    }

    let mut entries: Vec<_> = fs::read_dir(dir)?
        .filter_map(|e| e.ok())
        .filter(|e| e.path().extension().map_or(false, |ext| ext == "sql"))
        .collect();

    entries.sort_by_key(|e| e.path());

    for entry in entries {
        let path = entry.path();
        let filename = path.file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("");

        // Extract version number from filename
        let version: i32 = filename.split('_')
            .next()
            .and_then(|v| v.parse().ok())
            .ok_or_else(|| MigrationError::InvalidVersion(filename.to_string()))?;

        if version > current {
            tracing::info!("Applying migration from file: {:?}", path);

            let sql = fs::read_to_string(&path)?;
            conn.execute_batch(&sql)?;

            conn.execute(
                "INSERT INTO schema_version (version, name) VALUES (?1, ?2)",
                params![version, filename],
            )?;

            applied += 1;
            tracing::info!("Migration {} applied successfully", version);
        }
    }

    if applied > 0 {
        tracing::info!("Applied {} migration(s) from {:?}", applied, dir);
    }

    Ok(applied)
}
