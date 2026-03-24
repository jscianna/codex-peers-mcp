export type peer_scope = "machine" | "directory" | "repo";

export interface peer_record {
  id: string;
  pid: number;
  cwd: string;
  repo_root: string | null;
  repo_name: string | null;
  branch: string | null;
  summary: string;
  started_at: number;
  last_seen_at: number;
}

export interface message_record {
  id: number;
  to_peer_id: string;
  from_peer_id: string;
  body: string;
  created_at: number;
  read_at: number | null;
}
