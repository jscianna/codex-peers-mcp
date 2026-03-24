import { Database } from "bun:sqlite";

const db_path = process.env.CODEX_PEERS_DB || `${process.env.HOME}/.codex-peers.db`;

export function open_db() {
  const db = new Database(db_path, { create: true });

  db.exec(`
    CREATE TABLE IF NOT EXISTS peers (
      namespace TEXT NOT NULL DEFAULT 'default',
      id TEXT NOT NULL,
      pid INTEGER NOT NULL,
      cwd TEXT NOT NULL,
      repo_root TEXT,
      repo_name TEXT,
      branch TEXT,
      summary TEXT NOT NULL DEFAULT '',
      started_at INTEGER NOT NULL,
      last_seen_at INTEGER NOT NULL,
      PRIMARY KEY(namespace, id)
    );

    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      namespace TEXT NOT NULL DEFAULT 'default',
      to_peer_id TEXT NOT NULL,
      from_peer_id TEXT NOT NULL,
      body TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      read_at INTEGER
    );
  `);

  // lightweight migrations for older db files
  try {
    db.exec("ALTER TABLE peers ADD COLUMN namespace TEXT NOT NULL DEFAULT 'default'");
  } catch {}
  try {
    db.exec("ALTER TABLE messages ADD COLUMN namespace TEXT NOT NULL DEFAULT 'default'");
  } catch {}

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_messages_ns_to_peer_unread ON messages(namespace, to_peer_id, read_at, id);
    CREATE INDEX IF NOT EXISTS idx_peers_ns_last_seen ON peers(namespace, last_seen_at);
  `);

  return db;
}

export const now_ms = () => Date.now();
