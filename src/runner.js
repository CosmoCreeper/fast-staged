import { spawn } from "node:child_process";
import { join, dirname } from "node:path";
import { existsSync } from "node:fs";
import { buildMatcher } from "./matcher.js";

const IS_WIN = process.platform === "win32";
const PATH_SEP = IS_WIN ? ";" : ":";

/**
 * Build a PATH string that prepends node_modules/.bin from cwd upward.
 */
function buildPath(cwd) {
  const bins = [];
  let dir = cwd;
  while (true) {
    bins.push(join(dir, "node_modules/.bin"));
    const parent = dirname(dir);
    if (!parent || parent === dir) break;
    dir = parent;
  }
  return [...bins, process.env.PATH ?? ""].join(PATH_SEP);
}

/**
 * On Windows, spawn with shell:false won't resolve .cmd shims.
 * Walk PATH explicitly and return the full resolved path.
 */
function resolveBin(bin, PATH) {
  if (bin.includes("/") || bin.includes("\\")) return { bin, useShell: false };
  const extensions = IS_WIN ? [".cmd", ".exe", ".bat", ""] : [""];
  for (const dir of PATH.split(PATH_SEP)) {
    for (const ext of extensions) {
      const full = join(dir, bin + ext);
      if (existsSync(full)) {
        // .cmd files must be run via cmd.exe even with full path
        return { bin: full, useShell: ext === ".cmd" };
      }
    }
  }
  return { bin, useShell: false };
}

/**
 * Expand `{staged_files}` placeholder or append files to the command.
 */
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
  let inSingle = false,
    inDouble = false;
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
    } else if (ch === " " || ch === "\t") {
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

/**
 * Run a single command against the given files.
 * @param {string} pathEnv - Precomputed PATH (see buildPath)
 * @param {Map<string, { bin: string; useShell: boolean }>} binCache
 */
function runCommand(cmd, files, cwd, pathEnv, binCache) {
  return new Promise((resolve) => {
    const { bin: rawBin, args } = expandCommand(cmd, files);
    let resolved = binCache.get(rawBin);
    if (!resolved) {
      resolved = resolveBin(rawBin, pathEnv);
      binCache.set(rawBin, resolved);
    }
    const { bin, useShell } = resolved;
    const output = [];

    const child = spawn(bin, args, {
      cwd,
      env: { ...process.env, PATH: pathEnv },
      shell: useShell,
      stdio: ["ignore", "pipe", "pipe"],
    });

    child.stdout.on("data", (d) => output.push(d));
    child.stderr.on("data", (d) => output.push(d));
    child.on("close", (code) => {
      resolve({ ok: code === 0, output: Buffer.concat(output).toString(), cmd, files });
    });
    child.on("error", (err) => {
      resolve({
        ok: false,
        output: `${err.message}\nResolved bin: ${bin}\nPATH entries searched:\n${pathEnv.split(PATH_SEP).join("\n")}`,
        cmd,
        files,
      });
    });
  });
}

/**
 * Run all tasks (glob → commands) concurrently.
 */
export async function runTasks(config, staged, gitRoot, opts = {}) {
  const { verbose = false, concurrent = true, onUpdate = () => {} } = opts;
  const pathEnv = buildPath(gitRoot);
  const binCache = new Map();

  const tasks = Object.entries(config).map(([glob, commands]) => {
    const matcher = buildMatcher(glob);
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
    const promises = activeTasks.flatMap((task) =>
      task.commands.map((cmd) =>
        runCommand(cmd, task.matchedFiles, gitRoot, pathEnv, binCache).then((result) => {
          onUpdate({ type: "done", task, result });
          return result;
        }),
      ),
    );
    const results = await Promise.all(promises);
    allResults.push(...results);
    allOk = results.every((r) => r.ok);
  } else {
    for (const task of activeTasks) {
      for (const cmd of task.commands) {
        const result = await runCommand(cmd, task.matchedFiles, gitRoot, pathEnv, binCache);
        onUpdate({ type: "done", task, result });
        allResults.push(result);
        if (!result.ok) allOk = false;
      }
    }
  }

  return { ok: allOk, results: allResults };
}

export { expandCommand, splitShellWords };
