import { defineConfig } from "vite";
import { fileURLToPath } from 'node:url';

export default defineConfig({
  base: "./",
  resolve: { alias: [
    { find: /^@croc-classroom\/shared$/, replacement: fileURLToPath(new URL('../../packages/shared/src/index.ts', import.meta.url)) },
    { find: /^@croc-classroom\/shared\/mocks$/, replacement: fileURLToPath(new URL('../../packages/shared/src/mocks/index.ts', import.meta.url)) },
  ] },
  server: { host: "127.0.0.1", port: 5173, strictPort: true },
  build: { outDir: "dist/renderer" },
});
