import { spawnSync } from "node:child_process";

export interface repo_context {
  repo_root: string | null;
  repo_name: string | null;
  branch: string | null;
}

function run_git(args: string[], cwd: string): string | null {
  const res = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (res.status !== 0) return null;
  return res.stdout.trim() || null;
}

export function detect_repo_context(cwd: string): repo_context {
  const repo_root = run_git(["rev-parse", "--show-toplevel"], cwd);
  if (!repo_root) {
    return { repo_root: null, repo_name: null, branch: null };
  }

  const repo_name = repo_root.split("/").filter(Boolean).at(-1) || null;
  const branch = run_git(["rev-parse", "--abbrev-ref", "HEAD"], cwd);

  return { repo_root, repo_name, branch };
}
