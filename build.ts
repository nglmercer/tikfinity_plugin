// build.ts
import { build } from "esbuild";
import { version, name } from "./package.json";

const define = {
  __APP_VERSION__: JSON.stringify(version),
};

await Promise.all([
  // Main build
  build({
    entryPoints: ["src/index.ts"],
    outdir: "dist",
    entryNames: `[dir]/${name}`,
    bundle: true,
    platform: "node",
    format: "esm",
    define,
  }),

  // Webview script build
  build({
    entryPoints: ["webview/tikfinity-webview.ts"],
    outdir: "dist/webview",
    entryNames: "[name]",
    bundle: true,
    platform: "node",
    format: "esm",
    define,
  }),
]);
