import { loadConfig } from "./config.js";
import {
  getGitRoot,
  getGitRootPreferFs,
  getStagedAndPartialStatus,
  stashUnstaged,
  restageFiles,
} from "./git.js";
import { runTasks } from "./runner.js";
import { createRenderer, logInfo, log } from "./output.js";
import { spawnSync } from "node:child_process";

export async function fastStaged(options = {}) {
  const {
    cwd = process.cwd(),
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
    const gitRoot = leanOpt ? getGitRootPreferFs(cwd) : getGitRoot(cwd);

    const [stageStats, config] = await Promise.all([
      getStagedAndPartialStatus(gitRoot),
      Promise.resolve(loadConfig(cwd)),
    ]);
    const lean = config.lean || leanOpt;
    const { staged, hasUnstaged } = stageStats;

    if (staged.length === 0 && !allowEmpty) {
      logInfo("No staged files found.");
      return true;
    }

    if (debug && lean) logInfo("lean mode: skipping stash probe, stash, and re-stage git calls");

    const partiallyStaged = !lean && stash && hasUnstaged;
    if (partiallyStaged) {
      restoreStash = stashUnstaged(gitRoot);
    }

    const { ok, results } = await runTasks(config, staged, gitRoot, {
      verbose: verbose || debug,
      concurrent,
      onUpdate: renderer.onUpdate.bind(renderer),
    });

    if (!lean && diff && ok) {
      const modified = spawnSync("git", ["diff", "--name-only", "-z", "--", ...staged], {
        cwd: gitRoot,
        encoding: "utf8",
      })
        .stdout.split("\0")
        .filter(Boolean);
      if (modified.length) restageFiles(gitRoot, modified);
    }

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

export { loadConfig } from "./config.js";
export {
  getStagedAndPartialStatus,
  getGitRoot,
  getGitRootFromFilesystem,
  getGitRootPreferFs,
} from "./git.js";
export { runTasks } from "./runner.js";
export { buildMatcher } from "./matcher.js";
