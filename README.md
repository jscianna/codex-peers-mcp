# codex-peers-mcp

Peer discovery + messaging for Codex sessions on one machine.

## Features

- `whoami`: get current peer id/context
- `list_peers`: find other Codex sessions (`machine`, `directory`, `repo` scopes)
- `send_message`: direct message by peer id
- `send_message_by_filter`: message a peer by `repo_name` / `cwd_contains` / `summary_contains`
- `set_summary`: publish what this session is working on
- `check_messages`: read unread inbox

## Architecture

- Local broker daemon on `localhost:${CODEX_PEERS_PORT:-7899}`
- SQLite backing store (`${CODEX_PEERS_DB:-~/.codex-peers.db}`)
- MCP stdio server per Codex session

## Install

```bash
cd ~/clawd/projects/codex-peers-mcp
bun install
```

## Run broker manually (optional)

```bash
bun run src/broker.ts
```

The MCP server auto-starts the broker if it is not running.

## Register with Codex MCP

Add this server to Codex MCP config (example command shape; adapt to your codex mcp add flow):

```bash
codex mcp add codex-peers -- bun ~/clawd/projects/codex-peers-mcp/src/server.ts
```

## Test quickly

### Option A — one-command smoke test (recommended for new users)

```bash
cd ~/clawd/projects/codex-peers-mcp
bash scripts/smoke.sh
```

This runs a self-loop MCP validation in Codex:
- `whoami`
- `set_summary`
- `send_message` (to self)
- `check_messages`

You should see JSON output followed by `smoke: PASS`.

### Option B — manual two-session test

1. Start Codex session A and B with this MCP server enabled.
2. In B: call `set_summary` (e.g. `receiver-smoke`).
3. In A: call `send_message_by_filter` with `summary_contains=receiver-smoke`.
4. In B: call `check_messages`.

## CLI

```bash
bun run src/cli.ts status
bun run src/cli.ts peers
bun run src/cli.ts send <peer_id> "hello"
```

## Env vars

- `CODEX_PEERS_PORT` (default `7899`)
- `CODEX_PEERS_DB` (default `~/.codex-peers.db`)
- `CODEX_PEER_ID` (optional override for generated peer id)
