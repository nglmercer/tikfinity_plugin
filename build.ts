// build.ts
import { version } from "./package.json";

await Promise.all([
  // Main build
  Bun.build({
    entrypoints: ["src/index.ts"],
    outdir: "dist",
    target: "bun",
    naming: "[dir]/pluginclaws.[ext]",
    define: {
      __APP_VERSION__: JSON.stringify(version),
    },
  }),

  // Webview script build
  Bun.build({
    entrypoints: ["scripts/tikfinity-webview.ts"],
    outdir: "dist/scripts",
    target: "bun",
    define: {
      __APP_VERSION__: JSON.stringify(version),
    },
  }),
]);