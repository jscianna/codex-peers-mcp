#!/usr/bin/env bash
set -euo pipefail

# codex-peers smoke test (single-session self-loop)
# Verifies: whoami -> set_summary -> send_message -> check_messages

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if ! command -v codex >/dev/null 2>&1; then
  echo "error: codex CLI not found in PATH"
  exit 1
fi

if ! codex mcp get codex-peers >/dev/null 2>&1; then
  echo "error: codex-peers MCP not registered."
  echo "run: codex mcp add codex-peers -- bun $ROOT_DIR/src/server.ts"
  exit 1
fi

TEST_MSG="smoke-$(date +%s)"
PROMPT="Use MCP codex-peers.
1) Call whoami and store peer_id.
2) Call set_summary with summary \"smoke-test\".
3) Call send_message to that same peer_id with body \"__TEST_MSG__\".
4) Call check_messages with mark_read=true.
5) Return ONLY valid JSON exactly in this shape:
{\"peer_id\":\"...\",\"ok\":true|false,\"found_message\":true|false,\"message_count\":N}
Set found_message=true only if one returned message body equals \"__TEST_MSG__\"."
PROMPT="${PROMPT//__TEST_MSG__/$TEST_MSG}"

RAW_OUTPUT=$(env -u OPENAI_API_KEY codex exec --skip-git-repo-check --full-auto "$PROMPT" || true)
JSON_LINE=$(printf '%s\n' "$RAW_OUTPUT" | tail -n 1)

echo "$JSON_LINE"

if command -v jq >/dev/null 2>&1; then
  ok=$(printf '%s' "$JSON_LINE" | jq -r '.ok // false' 2>/dev/null || echo false)
  found=$(printf '%s' "$JSON_LINE" | jq -r '.found_message // false' 2>/dev/null || echo false)
  if [[ "$ok" == "true" && "$found" == "true" ]]; then
    echo "smoke: PASS"
    exit 0
  fi
fi

echo "smoke: FAIL"
exit 1
