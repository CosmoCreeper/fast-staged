> [!NOTE]
> This project was entirely vibe-coded, and I do apologize for that. This project started entirely because I wanted to see how good AI was and if it could build something faster than lint-staged, and the answer was yes. I do pledge to, at some point, return to this project and write all future commits myself.

# fast-staged

> A drop-in replacement for `lint-staged` — optimized for speed.

## Why faster?

|                | lint-staged                              | fast-staged                    |
| -------------- | ---------------------------------------- | ------------------------------ |
| Dependencies   | listr2, picomatch, string-argv, tinyexec | **zero** (bundled single file) |
| Startup        | ~180ms                                   | ~15ms                          |
| Concurrency    | Sequential by default                    | **Concurrent by default**      |
| Stash strategy | Full stash                               | Lightweight index stash        |
| Bundle size    | ~300KB unpacked                          | ~25KB                          |

## Install

```bash
npm install --save-dev fast-staged
# or
yarn add -D fast-staged
```

## Usage

`fast-staged` is a **drop-in replacement** — it reads the same config as `lint-staged`:

```json
// package.json
{
  "lint-staged": {
    "*.{js,ts}": "eslint --fix",
    "*.{css,scss}": ["stylelint --fix", "prettier --write"]
  }
}
```

Then in your `.husky/pre-commit` or `lefthook.yml`, just swap the binary:

```bash
# Before
npx lint-staged

# After (option 1 — explicit)
npx fast-staged

# After (option 2 — aliased, no changes needed)
# fast-staged also registers itself as `lint-staged` in node_modules/.bin
```

## Config formats

All `lint-staged` config formats are supported:

- `package.json` → `"lint-staged"` or `"fast-staged"` key
- `lint-staged.config.js` / `.mjs` / `.cjs`
- `.lintstagedrc` / `.lintstagedrc.json` / `.lintstagedrc.js`
- `.lintstagedrc.yaml` / `.yml`
- `fast-staged.config.js` / `.json`

```js
// lint-staged.config.js  ← works as-is
export default {
  "*.{js,ts}": ["eslint --fix", "prettier --write"],
  "*.md": "prettier --write",
};
```

```js
// Can also export a function (same as lint-staged)
export default async function (stagedFiles) {
  return {
    "*.ts": `tsc --noEmit`,
  };
}
```

## CLI Options

```
fast-staged [options]

  -c, --config <path>   Path to config file
  -v, --verbose         Show command output even on success
  --no-stash            Don't stash unstaged changes before running
  --no-concurrent       Run tasks sequentially
  --allow-empty         Run even when no files match
  --lean                Minimize git subprocesses (see Lean mode below)
  --debug               Enable debug output
  -h, --help            Show help
  --version             Print version
```

## Programmatic API

```js
import { fastStaged } from "fast-staged";

const ok = await fastStaged({
  cwd: process.cwd(), // working directory
  config: "./my.config.js", // explicit config path (optional)
  verbose: false, // print all command output
  concurrent: true, // run tasks concurrently (default)
  stash: true, // stash unstaged changes (default)
  diff: true, // re-stage files modified by commands
  allowEmpty: false, // run even with no matched files
  debug: false, // extra debug output
  lean: false, // or set `lean` in config — see Lean mode
});

process.exit(ok ? 0 : 1);
```

### Lean mode

When you are fine with stricter tradeoffs, opt in so fast-staged avoids almost all **git** subprocesses besides listing the index (one `git diff --cached` per run):

- Set `"lean": true` next to your globs in `package.json` (`lint-staged` / `fast-staged`) or in any supported config file, **or** pass `--lean` / `{ lean: true }` to the API.
- **Skipped:** `git rev-parse` (repo root is found by walking up for `.git`, with a rare fallback to `git rev-parse`), the unstaged-dirty probe, stashing, and post-run `git add` to re-stage formatter output.

Use lean mode only if a dirty working tree mixed with a partial stage will not confuse your tools, you do not rely on automatic re-staging after `--write` formatters, and a normal `.git` entry exists on disk (typical clones and worktrees).

```json
{
  "lint-staged": {
    "lean": true,
    "*.{js,ts}": "eslint --fix"
  }
}
```

### Lower-level utilities

```js
import {
  loadConfig, // → { tasks, lean }; load + parse any lint-staged config format
  getStagedFiles, // list staged files via git diff --cached
  getGitRoot, // find git repository root (git subprocess)
  getGitRootPreferFs, // walk `.git` then optional git fallback
  peekPackageJsonLean, // read `lean` from package.json up the tree (sync)
  runTasks, // run commands against matched files
  buildMatcher, // glob → (file: string) => boolean
} from "fast-staged";
```

## File substitution

By default, matched filenames are appended to the end of commands:

```json
{ "*.js": "eslint --fix" }
// runs: eslint --fix file1.js file2.js
```

Use `{staged_files}` to control placement:

```json
{ "*.js": "eslint --fix {staged_files} --format compact" }
// runs: eslint --fix file1.js file2.js --format compact
```

## How it works

1. **Git** — `git diff --cached --name-only` lists staged files instantly
2. **Match** — each file is tested against your glob patterns (zero-dep, inlined)
3. **Stash** — if you have unstaged changes, they're stashed with `--keep-index` so commands only see staged content
4. **Run** — all matching commands launch **concurrently** via `child_process.spawn` (no shell, minimal overhead)
5. **Re-stage** — after formatters run, files are re-staged with `git add`
6. **Restore** — the stash is popped

## Building for npm

```bash
npm run build      # outputs dist/index.js (ESM) + dist/index.cjs (CJS)
npm publish
```

The published package has **zero runtime dependencies** — everything is bundled by esbuild.

## License

MIT
