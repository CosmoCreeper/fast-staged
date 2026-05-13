import { readFileSync, existsSync } from "node:fs";
import { resolve, join, dirname } from "node:path";

const CONFIG_FILES = [
  ".fast-staged.config.js",
  ".fast-staged.config.mjs",
  ".fast-staged.config.cjs",
  ".fast-staged.config.json",
  // Pick up lint-staged configs
  "lint-staged.config.js",
  "lint-staged.config.mjs",
  "lint-staged.config.cjs",
  ".lintstagedrc",
  ".lintstagedrc.json",
  ".lintstagedrc.js",
  ".lintstagedrc.mjs",
  ".lintstagedrc.cjs",
  ".lintstagedrc.yaml",
  ".lintstagedrc.yml",
];

const LEAN_KEY = "lean";

/**
 * True if `package.json` in cwd or any parent declares `lean` under `fast-staged` / `lint-staged`.
 * Lets lean mode skip `git rev-parse` before the full config is loaded.
 */
export function peekPackageJsonLean(cwd = process.cwd()) {
  let dir = resolve(cwd);
  while (true) {
    const pkgPath = join(dir, "package.json");
    if (existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
        for (const key of ["fast-staged", "lint-staged"]) {
          const block = pkg[key];
          if (block && typeof block === "object" && !Array.isArray(block) && readLeanFlag(block)) {
            return true;
          }
        }
      } catch {
        // ignore invalid package.json
      }
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return false;
}

/**
 * Load config from:
 *  1. Explicit --config path
 *  2. Auto-discovered config files (walking up from cwd)
 *  3. `lint-staged` key in package.json
 *
 * @returns {Promise<{ tasks: Record<string, string[]>, lean: boolean }>}
 */
export async function loadConfig(explicitPath, cwd = process.cwd()) {
  if (explicitPath) {
    return parseConfigFile(resolve(cwd, explicitPath));
  }

  // Walk up directory tree looking for config
  let dir = cwd;
  while (true) {
    // Favor package.json
    const pkgPath = join(dir, "package.json");
    if (existsSync(pkgPath)) {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
      const config = pkg["fast-staged"] ?? pkg["lint-staged"];
      if (config) return normalizeConfig(config);
    }

    for (const name of CONFIG_FILES) {
      const full = join(dir, name);
      if (existsSync(full)) {
        return parseConfigFile(full);
      }
    }

    for (const name of CONFIG_FILES) {
      const full = join(dir, name);
      if (existsSync(full)) {
        return parseConfigFile(full);
      }
    }

    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  throw new Error(
    'No fast-staged config found. Add a "lint-staged" key to package.json or create a lint-staged.config.js file.',
  );
}

async function parseConfigFile(filePath) {
  if (filePath.endsWith(".json") || filePath.endsWith("rc")) {
    try {
      return normalizeConfig(JSON.parse(readFileSync(filePath, "utf8")));
    } catch {
      // Fall through to dynamic import
    }
  }

  if (filePath.endsWith(".yaml") || filePath.endsWith(".yml")) {
    // Minimal YAML parser for simple key: value and key: [array] configs
    return normalizeConfig(parseSimpleYaml(readFileSync(filePath, "utf8")));
  }

  // Dynamic import will handle it
  const mod = await import(`file://${filePath}?t=${Date.now()}`);
  const config = mod.default ?? mod;
  if (typeof config === "function") return normalizeConfig(await config());
  return normalizeConfig(config);
}

function readLeanFlag(raw) {
  return raw[LEAN_KEY] === true || raw[LEAN_KEY] === "true";
}

function normalizeConfig(raw) {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new Error("Config must be an object mapping globs to commands.");
  }
  const lean = readLeanFlag(raw);
  const out = {};
  for (const [glob, cmds] of Object.entries(raw)) {
    if (glob === LEAN_KEY) continue;
    out[glob] = Array.isArray(cmds) ? cmds : [cmds];
  }
  if (Object.keys(out).length === 0) {
    throw new Error("Config must have at least one glob pattern (besides 'lean').");
  }
  return { tasks: out, lean };
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

    const key = line
      .slice(0, colonIdx)
      .trim()
      .replace(/^['"]|['"]$/g, "");
    const rest = line.slice(colonIdx + 1).trim();

    if (!rest) {
      // Array follows
      const items = [];
      i++;
      while (i < lines.length && lines[i].match(/^\s+-\s/)) {
        items.push(
          lines[i]
            .replace(/^\s+-\s/, "")
            .trim()
            .replace(/^['"]|['"]$/g, ""),
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
