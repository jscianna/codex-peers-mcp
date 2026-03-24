#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

PORT="${CODEX_PEERS_TEST_PORT:-7901}"
DB_PATH="${ROOT_DIR}/.tmp-test.sqlite"
NAMESPACE="${CODEX_PEERS_TEST_NAMESPACE:-test-ns}"
TOKEN="${CODEX_PEERS_TEST_TOKEN:-test-token}"

cleanup() {
  if [[ -n "${BROKER_PID:-}" ]]; then
    kill "$BROKER_PID" >/dev/null 2>&1 || true
  fi
  rm -f "$DB_PATH" "${DB_PATH}-shm" "${DB_PATH}-wal"
}
trap cleanup EXIT

CODEX_PEERS_PORT="$PORT" CODEX_PEERS_DB="$DB_PATH" CODEX_PEERS_NAMESPACE="$NAMESPACE" CODEX_PEERS_TOKEN="$TOKEN" bun run src/broker.ts >/tmp/codex-peers-broker-test.log 2>&1 &
BROKER_PID=$!
sleep 1

curl -fsS "http://127.0.0.1:${PORT}/health" >/dev/null

curl -fsS -X POST "http://127.0.0.1:${PORT}/register" \
  -H "x-codex-peers-token: ${TOKEN}" \
  -H 'content-type: application/json' \
  -d '{"id":"peer-a","pid":111,"cwd":"/tmp/a","summary":"a"}' >/dev/null

curl -fsS -X POST "http://127.0.0.1:${PORT}/register" \
  -H "x-codex-peers-token: ${TOKEN}" \
  -H 'content-type: application/json' \
  -d '{"id":"peer-b","pid":222,"cwd":"/tmp/b","summary":"b"}' >/dev/null

peers_json=$(curl -fsS -H "x-codex-peers-token: ${TOKEN}" "http://127.0.0.1:${PORT}/peers")
printf '%s' "$peers_json" | grep -q 'peer-a'
printf '%s' "$peers_json" | grep -q 'peer-b'

send_json=$(curl -fsS -X POST "http://127.0.0.1:${PORT}/send" \
  -H "x-codex-peers-token: ${TOKEN}" \
  -H 'content-type: application/json' \
  -d '{"to_peer_id":"peer-b","from_peer_id":"peer-a","body":"route-test"}')
msg_id=$(printf '%s' "$send_json" | sed -n 's/.*"message_id":\([0-9]*\).*/\1/p')

msgs_json=$(curl -fsS -H "x-codex-peers-token: ${TOKEN}" "http://127.0.0.1:${PORT}/messages?peer_id=peer-b&only_unread=true")
printf '%s' "$msgs_json" | grep -q 'route-test'

curl -fsS -X POST "http://127.0.0.1:${PORT}/mark_read" \
  -H "x-codex-peers-token: ${TOKEN}" \
  -H 'content-type: application/json' \
  -d "{\"ids\":[${msg_id:-1}]}" >/dev/null

after_json=$(curl -fsS -H "x-codex-peers-token: ${TOKEN}" "http://127.0.0.1:${PORT}/messages?peer_id=peer-b&only_unread=true")
printf '%s' "$after_json" | grep -q '"messages":\[\]'

echo "broker-routes: PASS"
