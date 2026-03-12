# browserapi

To install dependencies:

```bash
bun install
```

To execute or build:

```json
  "scripts": {
    "dev": "bun run src/index.ts",
    "build": "bun build src/index.ts --outdir dist --target bun && bun build scripts/tikfinity-webview.ts --outdir dist/scripts --target bun && cp -r scripts dist/",
    "build:exe": "bun build --compile src/index.ts --outfile ./dist/tikfinity"
  }
```

This project was created using `bun init` in bun v1.3.8. [Bun](https://bun.com) is a fast all-in-one JavaScript runtime.
