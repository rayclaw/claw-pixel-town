#!/bin/bash
# Seed a default join key for testing
# Usage: ./scripts/seed.sh [server_url]

SERVER="${1:-http://localhost:3800}"

echo "Seeding default join key..."

# The server creates the DB on startup. We use sqlite3 directly to add a test key.
DB_PATH="${2:-star-office.db}"

sqlite3 "$DB_PATH" <<'SQL'
INSERT OR IGNORE INTO join_keys (key, max_concurrent, reusable, expires_at)
VALUES ('test_key_001', 5, 1, NULL);

INSERT OR IGNORE INTO join_keys (key, max_concurrent, reusable, expires_at)
VALUES ('demo_key_001', 3, 1, NULL);
SQL

echo "Done. Keys added:"
sqlite3 "$DB_PATH" "SELECT * FROM join_keys;"
