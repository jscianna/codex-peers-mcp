const broker_port = Number(process.env.CODEX_PEERS_PORT || 7899);
const broker_url = `http://127.0.0.1:${broker_port}`;
const broker_token = process.env.CODEX_PEERS_TOKEN || "";

async function fetch_json(path: string, init?: RequestInit) {
  const res = await fetch(`${broker_url}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(broker_token ? { "x-codex-peers-token": broker_token } : {}),
      ...(init?.headers || {}),
    },
  });

  if (!res.ok) {
    throw new Error(`broker ${res.status}: ${await res.text()}`);
  }

  return res.json();
}

async function main() {
  const [cmd, ...rest] = Bun.argv.slice(2);

  if (!cmd || cmd === "help") {
    console.log(`codex-peers cli\n\nCommands:\n  status\n  peers\n  send <peer_id> <message>`);
    return;
  }

  if (cmd === "status") {
    const health = await fetch_json("/health");
    const peers = await fetch_json("/peers");
    console.log(JSON.stringify({ health, peers }, null, 2));
    return;
  }

  if (cmd === "peers") {
    const peers = await fetch_json("/peers");
    console.log(JSON.stringify(peers, null, 2));
    return;
  }

  if (cmd === "send") {
    const [to_peer_id, ...msg_parts] = rest;
    const body = msg_parts.join(" ").trim();
    if (!to_peer_id || !body) {
      throw new Error("Usage: bun run src/cli.ts send <peer_id> <message>");
    }

    const out = await fetch_json("/send", {
      method: "POST",
      body: JSON.stringify({ to_peer_id, from_peer_id: "cli", body }),
    });

    console.log(JSON.stringify(out, null, 2));
    return;
  }

  throw new Error(`unknown command: ${cmd}`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
