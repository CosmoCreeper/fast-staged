// Produces a single-file zero-dependency CJS + ESM bundle.
import { build } from "esbuild";
import { mkdirSync } from "node:fs";

mkdirSync("dist", { recursive: true });

const shared = {
  entryPoints: ["src/index.js"],
  bundle: true,
  platform: "node",
  target: "node18",
  external: ["node:*"],
  minify: true,
  sourcemap: false,
};

await build({ ...shared, format: "esm", outfile: "dist/index.js" });
await build({ ...shared, format: "cjs", outfile: "dist/index.cjs" });

await build({
  ...shared,
  entryPoints: ["bin/fast-staged.js"],
  format: "esm",
  outfile: "dist/cli.js",
});

console.log("✔ fast-staged built to dist/");
