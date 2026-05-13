// Produces a single-file zero-dependency CJS + ESM bundle.
import { build } from "esbuild";
import { mkdirSync } from "node:fs";

mkdirSync("dist", { recursive: true });

const shared = {
  entryPoints: ["src/index.js"],
  bundle: true,
  platform: "node",
  target: "node18",
  // Mark node built-ins as external (they're always available)
  external: ["node:*"],
  minify: false, // keep readable for debugging; set true for prod
  sourcemap: false,
};

// ESM build
await build({
  ...shared,
  format: "esm",
  outfile: "dist/index.js",
});

// CJS build (for CommonJS consumers and older tooling)
await build({
  ...shared,
  format: "cjs",
  outfile: "dist/index.cjs",
});

// Bundle the CLI too (as a standalone script)
await build({
  entryPoints: ["bin/fast-staged.js"],
  bundle: true,
  platform: "node",
  target: "node18",
  external: ["node:*"],
  format: "esm",
  outfile: "dist/cli.js",
  banner: { js: "#!/usr/bin/env node" },
  minify: false,
});

console.log("✔ fast-staged built to dist/");
