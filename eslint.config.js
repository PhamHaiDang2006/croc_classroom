import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const NODE_MODULES = [
  'node:*',
  'fs',
  'fs/*',
  'path',
  'os',
  'crypto',
  'child_process',
  'stream',
  'stream/*',
  'url',
  'util',
  'net',
  'http',
  'https',
];

export default defineConfig(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/coverage/**',
      'packages/croc-engine/bin/**',
      'packages/croc-engine/.cache/**',
    ],
  },
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.node } },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  {
    // Phần shared mà renderer import được: không phụ thuộc Node.js.
    files: ['packages/shared/src/**/*.ts'],
    ignores: ['packages/shared/src/node/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: NODE_MODULES, message: 'Phần shared dùng cho renderer không được import module Node.js. Đặt mã này trong src/node/.' },
            { group: ['**/node', '**/node/*', '@croc-classroom/shared/node'], message: 'Không import phần Node.js của shared từ phần dùng cho renderer.' },
          ],
        },
      ],
      'no-restricted-globals': ['error', 'Buffer', 'process', '__dirname', '__filename', 'require'],
    },
  },
  {
    // Renderer (A) chỉ gọi API preload; không chạm vào Node.js, Electron hay croc.
    files: ['apps/desktop/src/renderer/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: NODE_MODULES, message: 'Renderer không được dùng module Node.js; gọi qua window.croc.' },
            { group: ['electron', '@croc-classroom/croc-engine', '@croc-classroom/croc-engine/*', '@croc-classroom/shared/node'], message: 'Renderer không được import phần chạy trong main/Node.js.' },
          ],
        },
      ],
    },
  },
);
