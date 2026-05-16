import { readFileSync, existsSync } from "node:fs";
import { resolve, join, dirname } from "node:path";

export function loadConfig(cwd = process.cwd()) {
  // Walk up directory tree looking for config
  let dir = cwd;
  while (true) {
    const filePath = join(dir, ".faststagedrc.yml");
    if (existsSync(filePath)) {
      return normalizeConfig(parseSimpleYaml(readFileSync(filePath, "utf8")));
    }

    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  throw new Error("No fast-staged config found. Ensure you have a .faststagedrc.yml file.");
}

function normalizeConfig(raw) {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new Error("Config must be an object mapping globs to commands.");
  }
  const out = {};
  for (const [glob, cmds] of Object.entries(raw)) {
    if (glob === "lean") continue;
    out[glob] = Array.isArray(cmds) ? cmds : [cmds];
  }
  if (Object.keys(out).length === 0) {
    throw new Error("Config must have at least one glob.");
  }
  return out;
}

function parseSimpleYaml(text) {
  const ARRAY_ITEM = /^\s+-\s/;
  const STRIP_QUOTES = /^['"]|['"]$/g;

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

    const key = line.slice(0, colonIdx).trim().replace(STRIP_QUOTES, "");
    const rest = line.slice(colonIdx + 1).trim();

    if (!rest) {
      // Array follows
      const items = [];
      i++;
      while (i < lines.length && lines[i].match(/^\s+-\s/)) {
        items.push(lines[i].replace(ARRAY_ITEM, "").trim().replace(STRIP_QUOTES, ""));
        i++;
      }
      out[key] = items;
    } else {
      out[key] = rest.replace(STRIP_QUOTES, "");
      i++;
    }
  }
  return out;
}
