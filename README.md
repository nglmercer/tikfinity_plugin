# browserapi

Cross-runtime compatible (Node.js, Bun, Deno) TikTok live interaction plugin.

## Install dependencies

```bash
npm install
# or
bun install
# or
deno install
```

## Run or build

```json
  "scripts": {
    "dev": "tsx src/index.ts",
    "build": "tsx build.ts"
  }
```

```bash
npm run dev
npm run build
```

## Supported runtimes

- **Node.js** (v18+) — via `tsx` for TypeScript execution and `esbuild` for bundling
- **Bun** — `bun run src/index.ts` or `bun run build.ts`
- **Deno** — `deno run src/index.ts` or `deno run build.ts`
