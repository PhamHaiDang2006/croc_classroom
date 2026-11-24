import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { chmod, copyFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const releases = {
  'win32-x64': ['Windows-64bit.zip', '0eb2755ce9e73c172ec306167f3274c11b6d96de10f71a13abc7c0a2db7cd26a'],
  'linux-x64': ['Linux-64bit.tar.gz', '58ac4e1cc6f47e5982d08936b6484456286bfbdb4bc47e13b6894674a5f1ddca'],
  'darwin-x64': ['macOS-64bit.tar.gz', 'be8f34ab4e9666088fc29cc982cf18d22978fcd0fbf4a428fd2ac7be99af5943'],
  'darwin-arm64': ['macOS-ARM64.tar.gz', 'be7a6716068277002d2fc30a5c37c8786641b40226b412ace20b44aebacd594c'],
};
const target = process.argv[2] ?? process.platform + '-' + process.arch;
if (!Object.hasOwn(releases, target)) throw new Error('Unsupported target');
const [archive, digest] = releases[target];
const response = await fetch(
  'https://github.com/schollz/croc/releases/download/v10.7.0/croc_v10.7.0_' + archive,
);
if (!response.ok) throw new Error('Download failed: ' + response.status);
const bytes = Buffer.from(await response.arrayBuffer());
if (createHash('sha256').update(bytes).digest('hex') !== digest) throw new Error('Checksum mismatch');
const temp = await mkdtemp(join(tmpdir(), 'croc-release-'));
try {
  await writeFile(join(temp, archive), bytes);
  const name = target.startsWith('win32') ? 'croc.exe' : 'croc';
  if (target.startsWith('win32') && process.platform !== 'win32') {
    execFileSync('unzip', ['-o', archive, name], { cwd: temp });
  } else execFileSync('tar', ['-xf', archive, name], { cwd: temp });
  const dir = fileURLToPath(new URL('../bin/' + target + '/', import.meta.url));
  await mkdir(dir, { recursive: true });
  await copyFile(join(temp, name), join(dir, name));
  await chmod(join(dir, name), 0o755);
} finally {
  await rm(temp, { recursive: true, force: true });
}
