import { open_db, now_ms } from "./db";

const port = Number(process.env.CODEX_PEERS_PORT || 7899);
const stale_after_ms = Number(process.env.CODEX_PEERS_STALE_MS || 30_000);

const db = open_db();

function json(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    ...init,
  });
}

function cleanup_stale_peers() {
  const cutoff = now_ms() - stale_after_ms;
  db.prepare("DELETE FROM peers WHERE last_seen_at < ?").run(cutoff);
}

setInterval(cleanup_stale_peers, 10_000);

Bun.serve({
  port,
  async fetch(req) {
    try {
      const url = new URL(req.url);

      if (req.method === "GET" && url.pathname === "/health") {
        return json({ ok: true, port });
      }

      if (req.method === "POST" && url.pathname === "/register") {
        const body = await req.json();
        const ts = now_ms();

        db.prepare(
          `INSERT INTO peers (id, pid, cwd, repo_root, repo_name, branch, summary, started_at, last_seen_at)
           VALUES (?, ?, ?, ?, ?, ?, COALESCE(?, ''), ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             pid = excluded.pid,
             cwd = excluded.cwd,
             repo_root = excluded.repo_root,
             repo_name = excluded.repo_name,
             branch = excluded.branch,
             summary = COALESCE(excluded.summary, peers.summary),
             last_seen_at = excluded.last_seen_at`
        ).run(
          body.id,
          Number(body.pid || 0),
          body.cwd || "",
          body.repo_root || null,
          body.repo_name || null,
          body.branch || null,
          body.summary || "",
          Number(body.started_at || ts),
          ts
        );

        return json({ ok: true });
      }

      if (req.method === "POST" && url.pathname === "/heartbeat") {
        const body = await req.json();
        db.prepare("UPDATE peers SET last_seen_at = ? WHERE id = ?").run(now_ms(), body.id);
        return json({ ok: true });
      }

      if (req.method === "POST" && url.pathname === "/set_summary") {
        const body = await req.json();
        db.prepare("UPDATE peers SET summary = ? WHERE id = ?").run(String(body.summary || ""), body.id);
        return json({ ok: true });
      }

      if (req.method === "GET" && url.pathname === "/peers") {
        cleanup_stale_peers();
        const rows = db
          .prepare(
            "SELECT id, pid, cwd, repo_root, repo_name, branch, summary, started_at, last_seen_at FROM peers ORDER BY last_seen_at DESC"
          )
          .all();
        return json({ peers: rows });
      }

      if (req.method === "POST" && url.pathname === "/send") {
        const body = await req.json();
        const result = db
          .prepare("INSERT INTO messages (to_peer_id, from_peer_id, body, created_at) VALUES (?, ?, ?, ?)")
          .run(body.to_peer_id, body.from_peer_id, String(body.body || ""), now_ms());

        return json({ ok: true, message_id: result.lastInsertRowid });
      }

      if (req.method === "GET" && url.pathname === "/messages") {
        const peer_id = url.searchParams.get("peer_id");
        const only_unread = url.searchParams.get("only_unread") !== "false";
        if (!peer_id) return json({ error: "peer_id is required" }, { status: 400 });

        const rows = only_unread
          ? db
              .prepare(
                "SELECT id, to_peer_id, from_peer_id, body, created_at, read_at FROM messages WHERE to_peer_id = ? AND read_at IS NULL ORDER BY id ASC"
              )
              .all(peer_id)
          : db
              .prepare(
                "SELECT id, to_peer_id, from_peer_id, body, created_at, read_at FROM messages WHERE to_peer_id = ? ORDER BY id DESC LIMIT 100"
              )
              .all(peer_id);

        return json({ messages: rows });
      }

      if (req.method === "POST" && url.pathname === "/mark_read") {
        const body = await req.json();
        const ids = (body.ids || []) as number[];
        const mark = db.prepare("UPDATE messages SET read_at = ? WHERE id = ?");
        const ts = now_ms();

        const tx = db.transaction((values: number[]) => {
          for (const id of values) mark.run(ts, id);
        });

        tx(ids);
        return json({ ok: true, count: ids.length });
      }

      return json({ error: "not_found" }, { status: 404 });
    } catch (error: any) {
      return json({ error: error?.message || "unknown_error" }, { status: 500 });
    }
  },
});

console.log(`codex-peers broker listening on http://localhost:${port}`);
