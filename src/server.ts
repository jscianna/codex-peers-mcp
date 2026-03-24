import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { cwd } from "node:process";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { detect_repo_context } from "./git";

type peer = {
  id: string;
  pid: number;
  cwd: string;
  repo_root: string | null;
  repo_name: string | null;
  branch: string | null;
  summary: string;
  started_at: number;
  last_seen_at: number;
};

type inbound_message = {
  id: number;
  to_peer_id: string;
  from_peer_id: string;
  body: string;
  created_at: number;
  read_at: number | null;
};

const broker_port = Number(process.env.CODEX_PEERS_PORT || 7899);
const broker_url = `http://127.0.0.1:${broker_port}`;
const self_id = process.env.CODEX_PEER_ID || randomUUID();
const self_cwd = process.env.PWD || cwd();
const started_at = Date.now();

async function fetch_json(path: string, init?: RequestInit) {
  const res = await fetch(`${broker_url}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.headers || {}),
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`broker ${res.status}: ${text}`);
  }

  return res.json();
}

async function ensure_broker() {
  try {
    await fetch_json("/health");
    return;
  } catch {
    // continue
  }

  const local_broker = new URL("./broker.ts", import.meta.url);
  if (!existsSync(local_broker)) {
    throw new Error(`broker.ts not found at ${local_broker}`);
  }

  const child = spawn("bun", ["run", local_broker.pathname], {
    detached: true,
    stdio: "ignore",
    env: process.env,
  });

  child.unref();

  for (let i = 0; i < 20; i += 1) {
    await Bun.sleep(150);
    try {
      await fetch_json("/health");
      return;
    } catch {
      // retry
    }
  }

  throw new Error("failed to start broker daemon");
}

async function register_self(summary = "") {
  const repo = detect_repo_context(self_cwd);
  await fetch_json("/register", {
    method: "POST",
    body: JSON.stringify({
      id: self_id,
      pid: process.pid,
      cwd: self_cwd,
      repo_root: repo.repo_root,
      repo_name: repo.repo_name,
      branch: repo.branch,
      summary,
      started_at,
    }),
  });
}

function apply_scope(peers: peer[], scope: "machine" | "directory" | "repo") {
  if (scope === "machine") return peers;
  if (scope === "directory") return peers.filter((x) => x.cwd === self_cwd);

  const repo = detect_repo_context(self_cwd);
  if (!repo.repo_root) return [];
  return peers.filter((x) => x.repo_root === repo.repo_root);
}

function render_peer_list(peers: peer[]) {
  if (!peers.length) return "No peers found.";

  return peers
    .map((p) => {
      const me = p.id === self_id ? " (you)" : "";
      const repo = p.repo_name ? `${p.repo_name}${p.branch ? `#${p.branch}` : ""}` : "no-repo";
      return `- ${p.id}${me}\n  cwd: ${p.cwd}\n  repo: ${repo}\n  summary: ${p.summary || "(none)"}`;
    })
    .join("\n");
}

function render_messages(messages: inbound_message[]) {
  if (!messages.length) return "No new messages.";
  return messages
    .map((m) => `- [${new Date(m.created_at).toISOString()}] ${m.from_peer_id}: ${m.body}`)
    .join("\n");
}

function pick_peer_by_filters(
  peers: peer[],
  filters: { repo_name?: string; cwd_contains?: string; summary_contains?: string }
): peer | null {
  let filtered = peers.filter((x) => x.id !== self_id);

  if (filters.repo_name) {
    filtered = filtered.filter((x) => x.repo_name === filters.repo_name);
  }

  if (filters.cwd_contains) {
    const needle = filters.cwd_contains.toLowerCase();
    filtered = filtered.filter((x) => x.cwd.toLowerCase().includes(needle));
  }

  if (filters.summary_contains) {
    const needle = filters.summary_contains.toLowerCase();
    filtered = filtered.filter((x) => (x.summary || "").toLowerCase().includes(needle));
  }

  return filtered[0] || null;
}

await ensure_broker();
await register_self();

setInterval(async () => {
  try {
    await fetch_json("/heartbeat", {
      method: "POST",
      body: JSON.stringify({ id: self_id }),
    });
  } catch {
    // ignore heartbeat errors
  }
}, 5_000);

const server = new McpServer({
  name: "codex-peers",
  version: "0.1.1",
});

server.registerTool(
  "whoami",
  {
    title: "Get my peer identity",
    description: "Return this session's peer id and context for reliable targeting.",
    inputSchema: {},
  },
  async () => {
    const repo = detect_repo_context(self_cwd);
    return {
      content: [
        {
          type: "text",
          text: `peer_id: ${self_id}\ncwd: ${self_cwd}\nrepo: ${repo.repo_name || "no-repo"}`,
        },
      ],
      structuredContent: {
        peer_id: self_id,
        cwd: self_cwd,
        repo_root: repo.repo_root,
        repo_name: repo.repo_name,
        branch: repo.branch,
      },
    };
  }
);

server.registerTool(
  "list_peers",
  {
    title: "List codex peers",
    description: "Discover other Codex peer sessions on this machine, optionally scoped by machine, current directory, or git repo.",
    inputSchema: {
      scope: z.enum(["machine", "directory", "repo"]).default("machine"),
      include_self: z.boolean().default(false),
    },
  },
  async ({ scope = "machine", include_self = false }) => {
    const data = (await fetch_json("/peers")) ;
    let peers = apply_scope(data.peers, scope);
    if (!include_self) peers = peers.filter((x) => x.id !== self_id);

    return {
      content: [{ type: "text", text: render_peer_list(peers) }],
      structuredContent: { peers },
    };
  }
);

server.registerTool(
  "send_message",
  {
    title: "Send a message to peer",
    description: "Send a direct message to another Codex peer by peer id.",
    inputSchema: {
      to_peer_id: z.string().min(1),
      body: z.string().min(1),
    },
  },
  async ({ to_peer_id, body }) => {
    await fetch_json("/send", {
      method: "POST",
      body: JSON.stringify({ to_peer_id, from_peer_id: self_id, body }),
    });

    return {
      content: [{ type: "text", text: `Message sent to ${to_peer_id}.` }],
      structuredContent: { ok: true, to_peer_id },
    };
  }
);

server.registerTool(
  "send_message_by_filter",
  {
    title: "Send message by peer filters",
    description: "Resolve a target peer by repo/cwd/summary filters and send a message without manually copying peer ids.",
    inputSchema: {
      body: z.string().min(1),
      repo_name: z.string().optional(),
      cwd_contains: z.string().optional(),
      summary_contains: z.string().optional(),
    },
  },
  async ({ body, repo_name, cwd_contains, summary_contains }) => {
    const data = (await fetch_json("/peers")) as { peers: peer[] };
    const target = pick_peer_by_filters(data.peers, { repo_name, cwd_contains, summary_contains });

    if (!target) {
      return {
        content: [{ type: "text", text: "No matching peer found." }],
        structuredContent: { ok: false, error: "no_matching_peer" },
        isError: true,
      };
    }

    await fetch_json("/send", {
      method: "POST",
      body: JSON.stringify({ to_peer_id: target.id, from_peer_id: self_id, body }),
    });

    return {
      content: [{ type: "text", text: `Message sent to ${target.id}.` }],
      structuredContent: { ok: true, to_peer_id: target.id },
    };
  }
);

server.registerTool(
  "set_summary",
  {
    title: "Set session summary",
    description: "Set a short status summary so other peers can discover what this Codex session is working on.",
    inputSchema: {
      summary: z.string().max(400),
    },
  },
  async ({ summary }) => {
    await fetch_json("/set_summary", {
      method: "POST",
      body: JSON.stringify({ id: self_id, summary }),
    });

    return {
      content: [{ type: "text", text: "Summary updated." }],
      structuredContent: { ok: true, summary },
    };
  }
);

server.registerTool(
  "check_messages",
  {
    title: "Check incoming messages",
    description: "Fetch unread messages sent by other Codex peers and mark them as read.",
    inputSchema: {
      mark_read: z.boolean().default(true),
    },
  },
  async ({ mark_read = true }) => {
    const data = (await fetch_json(`/messages?peer_id=${encodeURIComponent(self_id)}&only_unread=true`)) ;

    if (mark_read && data.messages.length) {
      await fetch_json("/mark_read", {
        method: "POST",
        body: JSON.stringify({ ids: data.messages.map((x) => x.id) }),
      });
    }

    return {
      content: [{ type: "text", text: render_messages(data.messages) }],
      structuredContent: { messages: data.messages },
    };
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
