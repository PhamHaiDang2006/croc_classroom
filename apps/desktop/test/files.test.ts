import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { it, expect } from 'vitest';
import { computeManifest } from '@croc-classroom/shared/node';
import { LocalFiles } from '../src/main/files.js';
import { Folders } from '../src/main/folders.js';

it('stages only selected files and keeps an edited work copy separate from verified cache', async () => {
  const root = await mkdtemp(join(tmpdir(), 'classroom-files-'));
  try {
    const files = new LocalFiles(root, root);
    await writeFile(join(root, 'đề.txt'), 'original');
    await writeFile(join(root, 'private.txt'), 'unselected');
    const picked = await files.select([join(root, 'đề.txt')], false);
    const { dir, manifest } = files.selected(picked.selectionId);
    expect(manifest.files.map((x) => x.path)).toEqual(['đề.txt']);
    const id = randomUUID();
    await files.keep(id, dir, manifest);
    const folders = new Folders(root);
    const work = join(root, 'work');
    await folders.installWork(work, id, 'Bài 1', dir, manifest);
    await writeFile(join(work, 'Bài 1', 'đề.txt'), 'my answer');
    await folders.installWork(work, id, 'Bài 1', dir, manifest);
    expect(await readFile(join(work, 'Bài 1', 'đề.txt'), 'utf8')).toBe('my answer');
    expect(await readFile(join(files.cache(id), 'đề.txt'), 'utf8')).toBe('original');
    await writeFile(join(files.cache(id), 'đề.txt'), 'wrong');
    const restart = new LocalFiles(root, root);
    await restart.restore();
    expect(restart.holdings.size).toBe(0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
it('replaces only the owned student folder after verifying the new version', async () => {
  const root = await mkdtemp(join(tmpdir(), 'classroom-collect-'));
  try {
    const folders = new Folders(root),
      base = join(root, 'thu'),
      dir = join(root, 'source');
    const student = { id: randomUUID(), mssv: 'SV01', fullName: 'Đặng Huy', classLabel: null };
    await mkdir(dir);
    await writeFile(join(dir, 'answer'), 'one');
    const manifest = await computeManifest(dir);
    await folders.replace(base, student, dir, manifest);
    const answer = join(base, 'SV01_DangHuy', 'answer');
    await writeFile(join(dir, 'answer'), 'two');
    await expect(folders.replace(base, student, dir, manifest)).rejects.toThrow();
    expect(await readFile(answer, 'utf8')).toBe('one');
    await folders.replace(base, student, dir, await computeManifest(dir));
    expect(await readFile(answer, 'utf8')).toBe('two');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
