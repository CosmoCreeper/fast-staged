import { loadConfig, peekPackageJsonLean } from "./config.js";
import {
  getGitRoot,
  getGitRootPreferFs,
  getStagedFiles,
  hasPartiallyStaged,
  stashUnstaged,
  restageFiles,
} from "./git.js";
import { runTasks } from "./runner.js";
import { createRenderer, logInfo, log } from "./output.js";

/**
 * Main fast-staged entry point.
 *
 * @param {Object} options
 * @param {string}  [options.cwd]        - Working directory (default: process.cwd())
 * @param {string}  [options.config]     - Explicit config file path
 * @param {boolean} [options.verbose]    - Print each command as it runs
 * @param {boolean} [options.concurrent] - Run commands concurrently (default: true)
 * @param {boolean} [options.stash]      - Stash unstaged changes (default: true)
 * @param {boolean} [options.diff]       - Re-stage files modified by commands (default: true)
 * @param {boolean} [options.debug]      - Extra debug output
 * @param {boolean} [options.allowEmpty] - Allow running when no staged files (default: false)
 * @param {boolean} [options.lean]       - Minimize git subprocesses (see README / config `lean`)
 *
 * @returns {Promise<boolean>} true = all tasks passed
 */
export async function fastStaged(options = {}) {
  const {
    cwd = process.cwd(),
    config: configPath,
    verbose = false,
    concurrent = true,
    stash = true,
    diff = true,
    debug = false,
    allowEmpty = false,
    lean: leanOpt = false,
  } = options;

  process.stderr.write(`\x1b[36m\x1b[1mfast-staged\x1b[0m \x1b[2mrunning...\x1b[0m\n`);

  const renderer = createRenderer(verbose || debug);
  let restoreStash = () => {};

  try {
    const peekLean = peekPackageJsonLean(cwd);
    const rootHint = leanOpt || peekLean;
    // 1. Git root (filesystem walk when lean is hinted — skips `git rev-parse` in normal layouts)
    const gitRoot = rootHint ? getGitRootPreferFs(cwd) : getGitRoot(cwd);
    if (debug) logInfo("git root:", gitRoot);

    // 2. Staged files first so we can skip config I/O when nothing is staged
    const staged = getStagedFiles(gitRoot);
    if (debug) logInfo("staged files:", staged.join(", ") || "(none)");

    if (staged.length === 0 && !allowEmpty) {
      logInfo("No staged files found.");
      return true;
    }

    // 3. Load config
    const { tasks: config, lean: leanFromFile } = await loadConfig(configPath, cwd);
    const lean = Boolean(leanOpt || leanFromFile || peekLean);
    if (debug && lean) logInfo("lean mode: skipping stash probe, stash, and re-stage git calls");

    if (debug) logInfo("config:", JSON.stringify(config, null, 2));

    // 4. Optionally stash unstaged changes for clean linting
    const partiallyStaged = !lean && stash && hasPartiallyStaged(gitRoot);
    if (partiallyStaged) {
      if (debug) logInfo("stashing unstaged changes...");
      restoreStash = stashUnstaged(gitRoot);
    }

    // 5. Run tasks
    const { ok, results } = await runTasks(config, staged, gitRoot, {
      verbose: verbose || debug,
      concurrent,
      onUpdate: renderer.onUpdate.bind(renderer),
    });

    // 6. Re-stage files modified by formatters (e.g. prettier --write)
    if (diff && ok && !lean) {
      restageFiles(gitRoot, staged);
    }

    // 7. Restore stash
    restoreStash();
    restoreStash = () => {};

    renderer.summary(ok, results);
    return ok;
  } catch (err) {
    restoreStash();
    log(`\n\x1b[31m\x1b[1m✖ fast-staged error:\x1b[0m ${err.message}`);
    if (debug) log(err.stack);
    return false;
  }
}

// Re-export lower-level utilities for advanced use
export { loadConfig, peekPackageJsonLean } from "./config.js";
export { getStagedFiles, getGitRoot, getGitRootFromFilesystem, getGitRootPreferFs } from "./git.js";
export { runTasks } from "./runner.js";
export { buildMatcher } from "./matcher.js";
