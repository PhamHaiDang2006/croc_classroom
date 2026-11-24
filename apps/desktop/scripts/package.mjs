import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { cp, copyFile, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const arch = process.argv[2] || process.arch;
const platform = process.platform;
execFileSync(
  process.execPath,
  ['../../packages/croc-engine/scripts/download.mjs', platform + '-' + arch],
  {
    stdio: 'inherit',
  },
);
const stage = await mkdtemp(join(tmpdir(), 'classroom-package-'));
try {
  await writeFile(
    join(stage, 'package.json'),
    JSON.stringify({
      name: 'croc-classroom',
      version: require('../package.json').version,
      main: 'main.cjs',
      description: 'Ứng dụng lớp học',
      author: 'Croc Classroom',
    }),
  );
  for (const f of ['main.cjs', 'preload.cjs', 'tray.png'])
    await copyFile('dist/' + f, join(stage, f));
  await cp('dist/renderer', join(stage, 'renderer'), { recursive: true });
  const { build, Platform, Arch } = require('electron-builder');
  const target = {
    win32: Platform.WINDOWS,
    darwin: Platform.MAC,
    linux: Platform.LINUX,
  }[platform];
  await build({
    projectDir: stage,
    targets: target.createTarget(undefined, Arch[arch]),
    publish: 'never',
    config: {
      appId: 'org.crocclassroom.desktop',
      productName: 'Croc Classroom',
      electronVersion: require('electron/package.json').version,
      directories: { output: resolve('dist/installers') },
      files: ['**/*'],
      npmRebuild: false,
      extraResources: [
        {
          from: resolve(
            '../../packages/croc-engine/bin/' + platform + '-' + arch,
          ),
          to: 'bin',
        },
        { from: resolve('assets/croc-LICENSE'), to: 'licenses/croc-MIT.txt' },
      ],
      win: { target: 'nsis', signAndEditExecutable: false },
      mac: { target: 'dmg', identity: null },
      linux: { target: 'AppImage', category: 'Education' },
    },
  });
} finally {
  await rm(stage, { recursive: true, force: true });
}
