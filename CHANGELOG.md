# Changelog

## 0.1.2 - 2026-03-24
- Added namespace isolation via `CODEX_PEERS_NAMESPACE`.
- Added optional broker auth via `CODEX_PEERS_TOKEN` + `x-codex-peers-token`.
- Scoped broker peer/message queries by namespace.
- Added compatibility migrations for existing SQLite DB files.
- Updated README with shared-host isolation guidance.

## 0.1.1 - 2026-03-24
- Added `whoami` MCP tool for stable peer targeting.
- Added `send_message_by_filter` MCP tool (`repo_name`, `cwd_contains`, `summary_contains`).
- Added one-command smoke test script (`scripts/smoke.sh`).
- Added broker route test script (`scripts/test-broker-routes.sh`).
- Added MIT license and repository hygiene (`.gitignore`).
- Updated README with testing and auth caveats.
