import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const src = (p: string) => fileURLToPath(new URL(p, import.meta.url));

// Khi test, các gói workspace trỏ thẳng vào mã nguồn để không phải build trước.
export default defineConfig({
  resolve: {
    alias: [
      { find: /^@croc-classroom\/shared$/, replacement: src('./packages/shared/src/index.ts') },
      { find: /^@croc-classroom\/shared\/node$/, replacement: src('./packages/shared/src/node/index.ts') },
      { find: /^@croc-classroom\/shared\/fixtures$/, replacement: src('./packages/shared/src/fixtures/index.ts') },
      { find: /^@croc-classroom\/shared\/mocks$/, replacement: src('./packages/shared/src/mocks/index.ts') },
      { find: /^@croc-classroom\/croc-engine$/, replacement: src('./packages/croc-engine/src/index.ts') },
      {
        find: /^@croc-classroom\/croc-engine\/testing$/,
        replacement: src('./packages/croc-engine/src/testing/index.ts'),
      },
    ],
  },
  test: {
    include: ['packages/*/test/**/*.test.ts', 'apps/*/test/**/*.test.ts'],
    environment: 'node',
  },
});
