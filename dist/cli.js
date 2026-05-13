#!/usr/bin/env node
#!/usr/bin/env node
var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// src/matcher.js
var matcher_exports = {};
__export(matcher_exports, {
  buildMatcher: () => buildMatcher
});
function escapeRegex(s) {
  return s.replace(/[.+^${}()|[\]\\]/g, "\\$&");
}
function expandBraces(pattern) {
  const match = pattern.match(/^(.*?)\{([^{}]*)\}(.*)$/);
  if (!match) return [pattern];
  const [, pre, inner, post] = match;
  return inner.split(",").flatMap((part) => expandBraces(`${pre}${part}${post}`));
}
function globToRegex(pattern) {
  let re = "";
  let i = 0;
  while (i < pattern.length) {
    const ch = pattern[i];
    if (ch === "*" && pattern[i + 1] === "*") {
      re += ".*";
      i += 2;
      if (pattern[i] === "/") i++;
    } else if (ch === "*") {
      re += "[^/]*";
      i++;
    } else if (ch === "?") {
      re += "[^/]";
      i++;
    } else if (ch === "[") {
      const end = pattern.indexOf("]", i);
      if (end === -1) {
        re += escapeRegex(ch);
        i++;
      } else {
        re += pattern.slice(i, end + 1);
        i = end + 1;
      }
    } else {
      re += escapeRegex(ch);
      i++;
    }
  }
  return new RegExp(`^${re}$`);
}
function buildMatcher(patterns) {
  if (!Array.isArray(patterns)) patterns = [patterns];
  const positives = [];
  const negatives = [];
  for (const raw of patterns) {
    const expanded = expandBraces(raw);
    for (const p of expanded) {
      if (p.startsWith("!")) {
        negatives.push(...expandBraces(p.slice(1)).flatMap(buildSinglePattern));
      } else {
        positives.push(...buildSinglePattern(p));
      }
    }
  }
  return (file) => {
    const f = file.replace(/\\/g, "/");
    const matched = positives.some((r) => r.test(f) || r.test(basename(f)));
    if (!matched) return false;
    return !negatives.some((r) => r.test(f) || r.test(basename(f)));
  };
}
function buildSinglePattern(p) {
  const results = [];
  if (!p.includes("/")) {
    results.push(globToRegex(`**/${p}`));
  }
  results.push(globToRegex(p));
  return results;
}
function basename(p) {
  return p.slice(p.lastIndexOf("/") + 1);
}
var init_matcher = __esm({
  "src/matcher.js"() {
  }
});

// src/config.js
import { readFileSync, existsSync } from "node:fs";
import { resolve, join, dirname } from "node:path";
import { createRequire } from "node:module";
var CONFIG_FILES = [
  ".fast-staged.config.js",
  ".fast-staged.config.mjs",
  ".fast-staged.config.cjs",
  ".fast-staged.config.json",
  // Drop-in compatibility — also pick up lint-staged configs
  "lint-staged.config.js",
  "lint-staged.config.mjs",
  "lint-staged.config.cjs",
  ".lintstagedrc",
  ".lintstagedrc.json",
  ".lintstagedrc.js",
  ".lintstagedrc.mjs",
  ".lintstagedrc.cjs",
  ".lintstagedrc.yaml",
  ".lintstagedrc.yml"
];
async function loadConfig(explicitPath, cwd = process.cwd()) {
  if (explicitPath) {
    return parseConfigFile(resolve(cwd, explicitPath));
  }
  let dir = cwd;
  while (true) {
    for (const name of CONFIG_FILES) {
      const full = join(dir, name);
      if (existsSync(full)) {
        return parseConfigFile(full);
      }
    }
    const pkgPath = join(dir, "package.json");
    if (existsSync(pkgPath)) {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
      const config = pkg["fast-staged"] ?? pkg["lint-staged"];
      if (config) return normalizeConfig(config);
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(
    'No fast-staged config found. Add a "lint-staged" key to package.json or create a lint-staged.config.js file.'
  );
}
async function parseConfigFile(filePath) {
  if (filePath.endsWith(".json") || filePath.endsWith("rc")) {
    try {
      return normalizeConfig(JSON.parse(readFileSync(filePath, "utf8")));
    } catch {
    }
  }
  if (filePath.endsWith(".yaml") || filePath.endsWith(".yml")) {
    return normalizeConfig(parseSimpleYaml(readFileSync(filePath, "utf8")));
  }
  const mod = await import(`file://${filePath}?t=${Date.now()}`);
  const config = mod.default ?? mod;
  if (typeof config === "function") return normalizeConfig(await config());
  return normalizeConfig(config);
}
function normalizeConfig(raw) {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new Error("Config must be an object mapping globs to commands.");
  }
  const out = {};
  for (const [glob, cmds] of Object.entries(raw)) {
    out[glob] = Array.isArray(cmds) ? cmds : [cmds];
  }
  return out;
}
function parseSimpleYaml(text) {
  const out = {};
  const lines = text.split("\n");
  let i = 0;
  while (i < lines.length) {
    const line = lines[i].trimEnd();
    if (!line || line.startsWith("#")) {
      i++;
      continue;
    }
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) {
      i++;
      continue;
    }
    const key = line.slice(0, colonIdx).trim().replace(/^['"]|['"]$/g, "");
    const rest = line.slice(colonIdx + 1).trim();
    if (!rest) {
      const items = [];
      i++;
      while (i < lines.length && lines[i].match(/^\s+-\s/)) {
        items.push(
          lines[i].replace(/^\s+-\s/, "").trim().replace(/^['"]|['"]$/g, "")
        );
        i++;
      }
      out[key] = items;
    } else {
      out[key] = rest.replace(/^['"]|['"]$/g, "");
      i++;
    }
  }
  return out;
}

// src/git.js
import { spawnSync, execFileSync } from "node:child_process";
import { resolve as resolve2 } from "node:path";
function getGitRoot(cwd = process.cwd()) {
  const result = spawnSync("git", ["rev-parse", "--show-toplevel"], {
    cwd,
    encoding: "utf8"
  });
  if (result.status !== 0) throw new Error("Not inside a git repository.");
  return result.stdout.trim();
}
function getStagedFiles(gitRoot) {
  const result = spawnSync("git", ["diff", "--cached", "--name-only", "--diff-filter=ACMR", "-z"], {
    cwd: gitRoot,
    encoding: "utf8"
  });
  if (result.status !== 0) return [];
  return result.stdout.split("\0").map((f) => f.trim()).filter(Boolean);
}
function hasPartiallyStaged(gitRoot) {
  const result = spawnSync("git", ["diff", "--name-only", "-z"], {
    cwd: gitRoot,
    encoding: "utf8"
  });
  if (result.status !== 0) return false;
  return result.stdout.split("\0").filter(Boolean).length > 0;
}
function stashUnstaged(gitRoot) {
  const stashResult = spawnSync(
    "git",
    [
      "stash",
      "push",
      "--keep-index",
      "--include-untracked",
      "-q",
      "--message",
      "fast-staged backup"
    ],
    { cwd: gitRoot, encoding: "utf8" }
  );
  const stashed = stashResult.status === 0 && !stashResult.stdout.includes("No local changes");
  return function restore() {
    if (!stashed) return;
    try {
      execFileSync("git", ["stash", "pop", "--index", "-q"], { cwd: gitRoot });
    } catch {
      try {
        execFileSync("git", ["stash", "drop", "-q"], { cwd: gitRoot });
      } catch {
      }
    }
  };
}
function restageFiles(gitRoot, files) {
  if (!files.length) return;
  const BATCH = 500;
  for (let i = 0; i < files.length; i += BATCH) {
    spawnSync("git", ["add", "--", ...files.slice(i, i + BATCH)], { cwd: gitRoot });
  }
}

// src/runner.js
import { spawn } from "node:child_process";
import { join as join2, dirname as dirname2 } from "node:path";
import { existsSync as existsSync2 } from "node:fs";
var IS_WIN = process.platform === "win32";
var PATH_SEP = IS_WIN ? ";" : ":";
function buildPath(cwd) {
  const bins = [];
  let dir = cwd;
  while (true) {
    bins.push(join2(dir, "node_modules/.bin"));
    const parent = dirname2(dir);
    if (!parent || parent === dir) break;
    dir = parent;
  }
  return [...bins, process.env.PATH ?? ""].join(PATH_SEP);
}
function resolveBin(bin, PATH) {
  if (bin.includes("/") || bin.includes("\\")) return { bin, useShell: false };
  const extensions = IS_WIN ? [".cmd", ".exe", ".bat", ""] : [""];
  for (const dir of PATH.split(PATH_SEP)) {
    for (const ext of extensions) {
      const full = join2(dir, bin + ext);
      if (existsSync2(full)) {
        return { bin: full, useShell: ext === ".cmd" };
      }
    }
  }
  return { bin, useShell: false };
}
function expandCommand(cmd, files) {
  const PLACEHOLDER = "{staged_files}";
  const parts = splitShellWords(cmd);
  const bin = parts[0];
  const rawArgs = parts.slice(1);
  const phIdx = rawArgs.indexOf(PLACEHOLDER);
  if (phIdx !== -1) {
    return { bin, args: [...rawArgs.slice(0, phIdx), ...files, ...rawArgs.slice(phIdx + 1)] };
  }
  return { bin, args: [...rawArgs, ...files] };
}
function splitShellWords(s) {
  const words = [];
  let cur = "";
  let inSingle = false, inDouble = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inSingle) {
      if (ch === "'") inSingle = false;
      else cur += ch;
    } else if (inDouble) {
      if (ch === '"') inDouble = false;
      else cur += ch;
    } else if (ch === "'") {
      inSingle = true;
    } else if (ch === '"') {
      inDouble = true;
    } else if (ch === " " || ch === "	") {
      if (cur) {
        words.push(cur);
        cur = "";
      }
    } else {
      cur += ch;
    }
  }
  if (cur) words.push(cur);
  return words;
}
function runCommand(cmd, files, cwd) {
  return new Promise((resolve3) => {
    const { bin: rawBin, args: args2 } = expandCommand(cmd, files);
    const PATH = buildPath(cwd);
    const { bin, useShell } = resolveBin(rawBin, PATH);
    const output = [];
    const child = spawn(bin, args2, {
      cwd,
      env: { ...process.env, PATH },
      shell: useShell,
      stdio: ["ignore", "pipe", "pipe"]
    });
    child.stdout.on("data", (d) => output.push(d));
    child.stderr.on("data", (d) => output.push(d));
    child.on("close", (code) => {
      resolve3({ ok: code === 0, output: Buffer.concat(output).toString(), cmd, files });
    });
    child.on("error", (err) => {
      resolve3({ ok: false, output: `${err.message}
Resolved bin: ${bin}
PATH entries searched:
${PATH.split(PATH_SEP).join("\n")}`, cmd, files });
    });
  });
}
async function runTasks(config, staged, gitRoot, opts2 = {}) {
  const { verbose = false, concurrent = true, onUpdate = () => {
  } } = opts2;
  const { buildMatcher: buildMatcher2 } = await Promise.resolve().then(() => (init_matcher(), matcher_exports));
  const tasks = Object.entries(config).map(([glob, commands]) => {
    const matcher = buildMatcher2(glob);
    const matchedFiles = staged.filter(matcher).map((f) => `${gitRoot}/${f}`);
    return { glob, commands, matchedFiles };
  });
  const activeTasks = tasks.filter((t) => t.matchedFiles.length > 0);
  if (activeTasks.length === 0) {
    return { ok: true, results: [] };
  }
  onUpdate({ type: "start", tasks: activeTasks });
  const allResults = [];
  let allOk = true;
  if (concurrent) {
    const promises = activeTasks.flatMap(
      (task) => task.commands.map(
        (cmd) => runCommand(cmd, task.matchedFiles, gitRoot).then((result) => {
          onUpdate({ type: "done", task, result });
          return result;
        })
      )
    );
    const results = await Promise.all(promises);
    allResults.push(...results);
    allOk = results.every((r) => r.ok);
  } else {
    for (const task of activeTasks) {
      for (const cmd of task.commands) {
        const result = await runCommand(cmd, task.matchedFiles, gitRoot);
        onUpdate({ type: "done", task, result });
        allResults.push(result);
        if (!result.ok) allOk = false;
      }
    }
  }
  return { ok: allOk, results: allResults };
}

// src/output.js
var RESET = "\x1B[0m";
var BOLD = "\x1B[1m";
var DIM = "\x1B[2m";
var RED = "\x1B[31m";
var GREEN = "\x1B[32m";
var CYAN = "\x1B[36m";
var symbols = {
  pass: process.platform === "win32" ? "\u221A" : "\u2714",
  fail: process.platform === "win32" ? "\xD7" : "\u2716",
  warn: "!",
  run: "\u25C6"
};
function log(msg) {
  process.stderr.write(msg + "\n");
}
function logInfo(label, msg = "") {
  log(`${CYAN}${BOLD}fast-staged${RESET} ${label}${msg ? " " + msg : ""}`);
}
function createRenderer(verbose) {
  const startTime = Date.now();
  let running = 0;
  let passed = 0;
  let failed = 0;
  return {
    onUpdate({ type, tasks, task, result }) {
      if (type === "start") {
        const list = tasks ?? [task];
        const n = list.length;
        running += n;
        if (verbose) {
          for (const t of list) {
            log(
              `  ${CYAN}${symbols.run}${RESET} ${DIM}${t.commands.join(", ")}${RESET}  ${DIM}(${t.matchedFiles.length} file${t.matchedFiles.length === 1 ? "" : "s"})${RESET}`
            );
          }
        }
      } else if (type === "done") {
        running--;
        if (result.ok) {
          passed++;
          if (verbose) {
            log(`  ${GREEN}${symbols.pass}${RESET} ${result.cmd}`);
          }
        } else {
          failed++;
          log(`
  ${RED}${BOLD}${symbols.fail} ${result.cmd}${RESET}`);
          if (result.output.trim()) {
            log(
              result.output.trimEnd().split("\n").map((l) => `    ${l}`).join("\n")
            );
          }
          log("");
        }
      }
    },
    summary(ok2, results) {
      const elapsed = ((Date.now() - startTime) / 1e3).toFixed(2);
      if (ok2) {
        log(
          `
${GREEN}${BOLD}${symbols.pass} fast-staged passed${RESET} ${DIM}(${elapsed}s)${RESET}`
        );
      } else {
        const failedCmds = results.filter((r) => !r.ok).map((r) => r.cmd);
        log(
          `
${RED}${BOLD}${symbols.fail} fast-staged failed${RESET} ${DIM}(${elapsed}s)${RESET}`
        );
        log(`${RED}Failed commands: ${failedCmds.join(", ")}${RESET}`);
      }
    }
  };
}

// src/index.js
init_matcher();
async function fastStaged(options = {}) {
  const {
    cwd = process.cwd(),
    config: configPath,
    verbose = false,
    concurrent = true,
    stash = true,
    diff = true,
    debug = false,
    allowEmpty = false
  } = options;
  process.stderr.write(`\x1B[36m\x1B[1mfast-staged\x1B[0m \x1B[2mrunning...\x1B[0m
`);
  const renderer = createRenderer(verbose || debug);
  let restoreStash = () => {
  };
  try {
    const gitRoot = getGitRoot(cwd);
    if (debug) logInfo("git root:", gitRoot);
    const config = await loadConfig(configPath, cwd);
    if (debug) logInfo("config:", JSON.stringify(config, null, 2));
    const staged = getStagedFiles(gitRoot);
    if (debug) logInfo("staged files:", staged.join(", ") || "(none)");
    if (staged.length === 0 && !allowEmpty) {
      logInfo("No staged files found.");
      return true;
    }
    const partiallyStaged = stash && hasPartiallyStaged(gitRoot);
    if (partiallyStaged) {
      if (debug) logInfo("stashing unstaged changes...");
      restoreStash = stashUnstaged(gitRoot);
    }
    const { ok: ok2, results } = await runTasks(config, staged, gitRoot, {
      verbose: verbose || debug,
      concurrent,
      onUpdate: renderer.onUpdate.bind(renderer)
    });
    if (diff && ok2) {
      restageFiles(gitRoot, staged);
    }
    restoreStash();
    restoreStash = () => {
    };
    renderer.summary(ok2, results);
    return ok2;
  } catch (err) {
    restoreStash();
    log(`
\x1B[31m\x1B[1m\u2716 fast-staged error:\x1B[0m ${err.message}`);
    if (debug) log(err.stack);
    return false;
  }
}

// bin/fast-staged.js
var args = process.argv.slice(2);
var opts = {
  config: void 0,
  verbose: false,
  stash: true,
  concurrent: true,
  allowEmpty: false,
  debug: false
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
    case "--debug":
      opts.debug = true;
      break;
    case "--version": {
      const { createRequire: createRequire2 } = await import("node:module");
      const { fileURLToPath } = await import("node:url");
      const { dirname: dirname3, join: join3 } = await import("node:path");
      const require2 = createRequire2(import.meta.url);
      const pkg = require2(join3(dirname3(fileURLToPath(import.meta.url)), "../package.json"));
      console.log(pkg.version);
      process.exit(0);
      break;
    }
    case "-h":
    case "--help":
      console.log(`
fast-staged \u2014 drop-in replacement for lint-staged

Usage:
  fast-staged [options]

Options:
  -c, --config <path>   Path to config file
  -v, --verbose         Show command output even on success
  --no-stash            Don't stash unstaged changes before running
  --no-concurrent       Run tasks sequentially
  --allow-empty         Run even when no files match
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
var ok = await fastStaged(opts);
process.exit(ok ? 0 : 1);
