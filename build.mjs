import { build } from "esbuild";
import { mkdirSync, readFileSync } from "node:fs";

const { version } = JSON.parse(readFileSync("package.json", "utf8"));

mkdirSync("dist", { recursive: true });

const shared = {
  bundle: true,
  platform: "node",
  target: "node18",
  external: ["node:*"],
  minify: true,
  sourcemap: false,
};

await Promise.all([
  build({ ...shared, entryPoints: ["src/index.js"], outfile: "dist/index.cjs", format: "cjs" }),
  build({
    ...shared,
    entryPoints: ["bin/fast-staged.js"],
    outfile: "dist/cli.js",
    format: "esm",
    define: { "process.env.prodVersion": JSON.stringify(version) },
  }),
]);

console.log("✔ fast-staged built to dist/");
