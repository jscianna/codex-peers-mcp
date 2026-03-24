import { Database } from "bun:sqlite";

const db_path = process.env.CODEX_PEERS_DB || `${process.env.HOME}/.codex-peers.db`;

export function open_db() {
  const db = new Database(db_path, { create: true });

  db.exec(`
    CREATE TABLE IF NOT EXISTS peers (
      id TEXT PRIMARY KEY,
      pid INTEGER NOT NULL,
      cwd TEXT NOT NULL,
      repo_root TEXT,
      repo_name TEXT,
      branch TEXT,
      summary TEXT NOT NULL DEFAULT '',
      started_at INTEGER NOT NULL,
      last_seen_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      to_peer_id TEXT NOT NULL,
      from_peer_id TEXT NOT NULL,
      body TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      read_at INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_messages_to_peer_unread ON messages(to_peer_id, read_at, id);
    CREATE INDEX IF NOT EXISTS idx_peers_last_seen ON peers(last_seen_at);
  `);

  return db;
}

export const now_ms = () => Date.now();
