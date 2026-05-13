import { spawnSync, execFileSync } from "node:child_process";
import { resolve, join, dirname } from "node:path";
import { existsSync } from "node:fs";

/**
 * Find the git root from cwd.
 */
export function getGitRoot(cwd = process.cwd()) {
  const result = spawnSync("git", ["rev-parse", "--show-toplevel"], {
    cwd,
    encoding: "utf8",
  });
  if (result.status !== 0) throw new Error("Not inside a git repository.");
  return result.stdout.trim();
}

/**
 * Find repo root by walking up for `.git` (no subprocess).
 * Matches `git rev-parse --show-toplevel` for normal repos, submodules, and worktrees.
 */
export function getGitRootFromFilesystem(cwd = process.cwd()) {
  let dir = resolve(cwd);
  while (true) {
    if (existsSync(join(dir, ".git"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) throw new Error("Not inside a git repository.");
    dir = parent;
  }
}

/**
 * Prefer filesystem discovery; fall back to `git rev-parse` (e.g. rare `GIT_DIR`-only setups).
 */
export function getGitRootPreferFs(cwd = process.cwd()) {
  try {
    return getGitRootFromFilesystem(cwd);
  } catch {
    return getGitRoot(cwd);
  }
}

/**
 * Return the list of staged files (relative to gitRoot, forward-slash separated).
 * Only returns files that exist on disk (not deleted files).
 */
export function getStagedFiles(gitRoot) {
  const result = spawnSync("git", ["diff", "--cached", "--name-only", "--diff-filter=ACMR", "-z"], {
    cwd: gitRoot,
    encoding: "utf8",
  });
  if (result.status !== 0) return [];
  return result.stdout
    .split("\0")
    .map((f) => f.trim())
    .filter(Boolean);
}

/**
 * Return the list of all staged files including deleted ones,
 * useful for determining if we should stash.
 */
export function hasPartiallyStaged(gitRoot) {
  const result = spawnSync("git", ["diff", "--name-only", "-z"], {
    cwd: gitRoot,
    encoding: "utf8",
  });
  if (result.status !== 0) return false;
  return result.stdout.split("\0").filter(Boolean).length > 0;
}

/**
 * Create a git stash of unstaged changes so we only lint what's staged.
 * Returns a cleanup function to restore the stash.
 */
export function stashUnstaged(gitRoot) {
  // Save the index (staged) state
  const stashResult = spawnSync(
    "git",
    [
      "stash",
      "push",
      "--keep-index",
      "--include-untracked",
      "-q",
      "--message",
      "fast-staged backup",
    ],
    { cwd: gitRoot, encoding: "utf8" },
  );

  const stashed = stashResult.status === 0 && !stashResult.stdout.includes("No local changes");

  return function restore() {
    if (!stashed) return;
    try {
      execFileSync("git", ["stash", "pop", "--index", "-q"], { cwd: gitRoot });
    } catch {
      // Best-effort restore
      try {
        execFileSync("git", ["stash", "drop", "-q"], { cwd: gitRoot });
      } catch {}
    }
  };
}

/**
 * Re-stage files that were modified by formatters.
 */
export function restageFiles(gitRoot, files) {
  if (!files.length) return;
  // Stage in batches to avoid ARG_MAX limits
  const BATCH = 500;
  for (let i = 0; i < files.length; i += BATCH) {
    spawnSync("git", ["add", "--", ...files.slice(i, i + BATCH)], { cwd: gitRoot });
  }
}
