# codex-peers-mcp v0.1.1

First public release of `codex-peers-mcp`: peer discovery + messaging for Codex sessions on one machine.

## Highlights

- MCP tools:
  - `whoami`
  - `list_peers`
  - `send_message`
  - `send_message_by_filter`
  - `set_summary`
  - `check_messages`
- Local broker daemon with SQLite queueing and stale-peer cleanup
- One-command smoke test: `bash scripts/smoke.sh`
- Broker route test: `bash scripts/test-broker-routes.sh`
- CI workflow on GitHub Actions (Bun install + broker route test)
- MIT license

## Notes

- If Codex reports quota unexpectedly, verify auth mode:
  - `codex login status`
  - Prefer ChatGPT OAuth for this workflow

## Verification run

- `scripts/test-broker-routes.sh`: PASS
- `scripts/smoke.sh`: PASS
