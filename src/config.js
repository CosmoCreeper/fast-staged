import { readFileSync, existsSync } from "node:fs";
import { resolve, join, dirname } from "node:path";
import { createRequire } from "node:module";

const CONFIG_FILES = [
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
  ".lintstagedrc.yml",
];

/**
 * Load config from:
 *  1. Explicit --config path
 *  2. Auto-discovered config files (walking up from cwd)
 *  3. `lint-staged` key in package.json
 *
 * Returns a plain object: { [glob]: string | string[] }
 */
export async function loadConfig(explicitPath, cwd = process.cwd()) {
  if (explicitPath) {
    return parseConfigFile(resolve(cwd, explicitPath));
  }

  // Walk up directory tree looking for config
  let dir = cwd;
  while (true) {
    for (const name of CONFIG_FILES) {
      const full = join(dir, name);
      if (existsSync(full)) {
        return parseConfigFile(full);
      }
    }

    // Check package.json
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

  // JS / MJS / CJS — dynamic import handles all
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
