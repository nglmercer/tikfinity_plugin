// build.ts
import { version, name } from "./package.json";

const define = {
  __APP_VERSION__: JSON.stringify(version),
};

await Promise.all([
  // Main build
  Bun.build({
    entrypoints: ["src/index.ts"],
    outdir: "dist",
    naming: `[dir]/${name}.[ext]`,
    target: "bun",
    define,
  }),

  // Webview script build
  Bun.build({
    entrypoints: ["webview/tikfinity-webview.ts"],
    outdir: "dist/webview",
    target: "bun",
    external: ["webview-napi"],
    define: define,
  }),
]);

/* await Promise.all([
  // Main build
  Bun.build({
    entrypoints: ["src/index.ts"],
    outdir: "dist",
    target: "bun",
    naming: "[dir]/pluginclaws.[ext]",
    define: define
  }),

  // Webview script build
  Bun.build({
    entrypoints: ["webview/tikfinity-webview.ts"],
    outdir: "dist/webview",
    target: "bun",
    define: define,
  }),
]); */
