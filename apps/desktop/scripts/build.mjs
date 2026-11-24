import { build } from 'esbuild';
import { copyFile } from 'node:fs/promises';

await Promise.all(
  ['main', 'preload'].map((part) =>
    build({
      entryPoints: ['src/' + part + '/index.ts'],
      outfile: 'dist/' + part + '.cjs',
      bundle: true,
      format: 'cjs',
      platform: 'node',
      target: 'node22',
      external: ['electron', 'bufferutil', 'utf-8-validate'],
      tsconfig: '../../tsconfig.json',
    }),
  ),
);
await copyFile('assets/tray.png', 'dist/tray.png');
