#!/usr/bin/env node
/**
 * fast-staged CLI
 * Drop-in replacement for lint-staged.
 *
 * Usage:
 *   fast-staged [options]
 *   lint-staged  [options]   ← same binary, aliased
 *
 * Options:
 *   -c, --config <path>       Path to configuration file
 *   -v, --verbose             Show command output even when successful
 *   --no-stash                Skip stashing unstaged changes
 *   --no-concurrent           Run tasks sequentially (default: concurrent)
 *   --allow-empty             Run even if no staged files match any pattern
 *   --lean                    Fewer git subprocesses (stash / re-stage skipped)
 *   --debug                   Extra debug output
 *   -h, --help                Show help
 *   --version                 Print version
 */

import { fastStaged } from "../src/index.js";

// Argument parsing
const args = process.argv.slice(2);
const opts = {
  config: undefined,
  verbose: false,
  stash: true,
  concurrent: true,
  allowEmpty: false,
  debug: false,
  lean: false,
};

for (let i = 0; i < args.length; i++) {
  const a = args[i];
  switch (a) {
    case "-c":
    case "--config":
      opts.config = args[++i];
      break;
    case "-v":
    case "--verbose":
      opts.verbose = true;
      break;
    case "--no-stash":
      opts.stash = false;
      break;
    case "--no-concurrent":
    case "--sequential":
      opts.concurrent = false;
      break;
    case "--allow-empty":
      opts.allowEmpty = true;
      break;
    case "--lean":
      opts.lean = true;
      break;
    case "--debug":
      opts.debug = true;
      break;
    case "--version": {
      const { createRequire } = await import("node:module");
      const { fileURLToPath } = await import("node:url");
      const { dirname, join } = await import("node:path");
      const require = createRequire(import.meta.url);
      const pkg = require(join(dirname(fileURLToPath(import.meta.url)), "../package.json"));
      console.log(pkg.version);
      process.exit(0);
      break;
    }
    case "-h":
    case "--help":
      console.log(`
fast-staged — drop-in replacement for lint-staged

Usage:
  fast-staged [options]

Options:
  -c, --config <path>   Path to config file
  -v, --verbose         Show command output even on success
  --no-stash            Don't stash unstaged changes before running
  --no-concurrent       Run tasks sequentially
  --allow-empty         Run even when no files match
  --lean                Fewer git calls (no stash probe / stash / re-stage); see docs
  --debug               Enable debug output
  -h, --help            Show this help message
  --version             Print version number

Config (any of these, searched from cwd upward):
  package.json          "lint-staged" or "fast-staged" key
  lint-staged.config.js / .lintstagedrc / .lintstagedrc.json
  fast-staged.config.js / .fast-staged.config.json
`);
      process.exit(0);
      break;
    default:
      if (a.startsWith("-")) {
        console.error(`fast-staged: unknown option: ${a}`);
        process.exit(1);
      }
  }
}

// Run
const ok = await fastStaged(opts);
process.exit(ok ? 0 : 1);
