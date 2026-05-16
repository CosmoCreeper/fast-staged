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
      console.log(process.env.prodVersion);
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
  -v, --verbose         Show command output even on success
  --no-stash            Don't stash unstaged changes before running
  --no-concurrent       Run tasks sequentially
  --allow-empty         Run even when no files match
  --lean                Fewer git calls (no stash probe / stash / re-stage); see docs
  --debug               Enable debug output
  -h, --help            Show this help message
  --version             Print version number

Config (searched from cwd upward): .faststagedrc.yml
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
