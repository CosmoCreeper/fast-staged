/**
 * Lightweight glob matcher — supports:
 *   *.js  **\/*.ts  {a,b}  [abc]  !negation  brace expansion
 * Intentionally minimal for startup speed.
 */

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
  // Handle ** and * carefully
  let re = "";
  let i = 0;
  while (i < pattern.length) {
    const ch = pattern[i];
    if (ch === "*" && pattern[i + 1] === "*") {
      re += ".*";
      i += 2;
      if (pattern[i] === "/") i++; // consume trailing slash
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

/**
 * Build a matcher function from one or more glob patterns.
 * Returns (filePath: string) => boolean
 * filePath should be relative to the git root, using forward slashes.
 */
export function buildMatcher(patterns) {
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
    // Normalise separators
    const f = file.replace(/\\/g, "/");
    const matched = positives.some((r) => r.test(f) || r.test(basename(f)));
    if (!matched) return false;
    return !negatives.some((r) => r.test(f) || r.test(basename(f)));
  };
}

function buildSinglePattern(p) {
  const results = [];
  // Bare extension like *.js should also match in subdirectories
  if (!p.includes("/")) {
    results.push(globToRegex(`**/${p}`));
  }
  results.push(globToRegex(p));
  return results;
}

function basename(p) {
  return p.slice(p.lastIndexOf("/") + 1);
}
