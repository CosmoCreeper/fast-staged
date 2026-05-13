import { loadConfig } from "./config.js";
import {
  getGitRoot,
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
 * @param {string[]} [options.allowEmpty] - Allow running when no files match
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
  } = options;

  process.stderr.write(`\x1b[36m\x1b[1mfast-staged\x1b[0m \x1b[2mrunning...\x1b[0m\n`);

  const renderer = createRenderer(verbose || debug);
  let restoreStash = () => {};

  try {
    // 1. Find git root
    const gitRoot = getGitRoot(cwd);
    if (debug) logInfo("git root:", gitRoot);

    // 2. Load config
    const config = await loadConfig(configPath, cwd);
    if (debug) logInfo("config:", JSON.stringify(config, null, 2));

    // 3. Get staged files
    const staged = getStagedFiles(gitRoot);
    if (debug) logInfo("staged files:", staged.join(", ") || "(none)");

    if (staged.length === 0 && !allowEmpty) {
      logInfo("No staged files found.");
      return true;
    }

    // 4. Optionally stash unstaged changes for clean linting
    const partiallyStaged = stash && hasPartiallyStaged(gitRoot);
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
    if (diff && ok) {
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
export { loadConfig } from "./config.js";
export { getStagedFiles, getGitRoot } from "./git.js";
export { runTasks } from "./runner.js";
export { buildMatcher } from "./matcher.js";
