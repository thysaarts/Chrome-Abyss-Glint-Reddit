/**
 * Publishing = committing the two CMS JSON files to the GitHub repo. Render
 * watches the branch and redeploys on every commit, so a publish goes live on
 * the game's URL a minute or two later. Uses the Git Data API so BOTH files
 * land in ONE commit (one deploy), authenticated with a fine-grained personal
 * access token that only ever lives in the admin's browser localStorage.
 */

export interface RepoConfig {
  owner: string;
  repo: string;
  branch: string;
  token: string;
}

export interface PublishFile {
  path: string; // repo-relative, e.g. "src/content/content.json"
  content: string;
}

export const DEFAULT_REPO: Omit<RepoConfig, "token"> = {
  owner: "thysaarts",
  repo: "Chrome-Abyss-Glint",
  branch: "main",
};

const API = "https://api.github.com";

async function gh(cfg: RepoConfig, path: string, init?: RequestInit): Promise<any> {
  const res = await fetch(`${API}/repos/${cfg.owner}/${cfg.repo}${path}`, {
    ...init,
    cache: "no-store", // never serve a stale branch head from the browser cache
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${cfg.token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  if (!res.ok) {
    let detail = "";
    try {
      detail = (await res.json()).message ?? "";
    } catch {
      /* ignore */
    }
    const hint =
      res.status === 401
        ? " — the token was rejected. Check it in Settings."
        : res.status === 403
        ? " — the token lacks permission (it needs Read and write access to Contents on this repo)."
        : res.status === 404
        ? " — repo not found (or the token cannot see it). Check owner/repo in Settings."
        : "";
    throw new Error(`GitHub ${res.status}${detail ? `: ${detail}` : ""}${hint}`);
  }
  return res.json();
}

// btoa() chokes on non-Latin-1; the copy is full of em-dashes and curly quotes,
// so encode via UTF-8 bytes.
function b64utf8(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

/** Commit pre-encoded blobs (text as UTF-8 base64, binaries as raw base64) to
 *  the branch in ONE commit. Returns the commit URL.
 *
 *  Right after a commit lands (e.g. an upload followed quickly by a publish),
 *  GitHub's ref API can briefly serve the PREVIOUS branch head — building on it
 *  gets a 422 "Update is not a fast forward". So the tree/commit/ref advance is
 *  retried on a fresh head read, up to 3 times with a short backoff. The blobs
 *  are uploaded once — they're content-addressed and head-independent. */
async function commitBlobs(cfg: RepoConfig, blobs: { path: string; base64: string }[], message: string): Promise<string> {
  // upload each file as a blob (once — reusable across retries)
  const treeItems = [];
  for (const f of blobs) {
    const blob = await gh(cfg, `/git/blobs`, {
      method: "POST",
      body: JSON.stringify({ content: f.base64, encoding: "base64" }),
    });
    treeItems.push({ path: f.path, mode: "100644", type: "blob", sha: blob.sha });
  }

  let lastErr: Error | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 900 * attempt));
    // current branch head → base commit + tree (re-read fresh on every attempt)
    const ref = await gh(cfg, `/git/ref/heads/${encodeURIComponent(cfg.branch)}`);
    const headSha: string = ref.object.sha;
    const headCommit = await gh(cfg, `/git/commits/${headSha}`);

    // new tree on top of the head tree, then the commit, then advance the branch
    const tree = await gh(cfg, `/git/trees`, {
      method: "POST",
      body: JSON.stringify({ base_tree: headCommit.tree.sha, tree: treeItems }),
    });
    const commit = await gh(cfg, `/git/commits`, {
      method: "POST",
      body: JSON.stringify({ message, tree: tree.sha, parents: [headSha] }),
    });
    try {
      await gh(cfg, `/git/refs/heads/${encodeURIComponent(cfg.branch)}`, {
        method: "PATCH",
        body: JSON.stringify({ sha: commit.sha, force: false }),
      });
      return `https://github.com/${cfg.owner}/${cfg.repo}/commit/${commit.sha}`;
    } catch (e) {
      lastErr = e as Error;
      if (!/fast forward/i.test(lastErr.message)) throw lastErr; // only retry the stale-head case
    }
  }
  throw lastErr ?? new Error("publish failed");
}

/** Commit the given TEXT files to the branch in a single commit. Returns the commit URL. */
export async function publishFiles(cfg: RepoConfig, files: PublishFile[], message: string): Promise<string> {
  return commitBlobs(cfg, files.map((f) => ({ path: f.path, base64: b64utf8(f.content) })), message);
}

/** Commit BINARY files (already base64-encoded — e.g. sticker art) in a single
 *  commit. Render redeploys on the commit, so anything under public/ is served
 *  at its site-relative path (public/stickers/x.webp → /stickers/x.webp) once
 *  the deploy lands (a minute or two). */
export async function publishBinaryFiles(cfg: RepoConfig, files: { path: string; base64: string }[], message: string): Promise<string> {
  return commitBlobs(cfg, files, message);
}

/** Fetch the LIVE (committed) version of a repo file — used to warn when the
 *  repo has newer content than the bundled defaults this admin build shipped with. */
export async function fetchRepoFile(cfg: RepoConfig, path: string): Promise<string> {
  const data = await gh(cfg, `/contents/${path}?ref=${encodeURIComponent(cfg.branch)}`);
  const bin = atob(data.content.replace(/\n/g, ""));
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}
