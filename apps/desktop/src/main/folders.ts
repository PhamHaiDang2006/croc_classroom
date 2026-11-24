import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, rmdir, lstat } from 'node:fs/promises';
import { join } from 'node:path';
import { checkManifestPath, type Manifest, type StudentRef } from '@croc-classroom/shared';
import { exists, copyVerified, writeAtomic } from './files.js';
import { ClientError } from './rest.js';

function segment(label: string, fallback: string) {
  const name = label
    .normalize('NFC')
    .replace(/[^\p{L}\p{N} _.-]+/gu, '_')
    .trim()
    .replace(/[. ]+$/, '')
    .slice(0, 100);
  return !name || checkManifestPath(name) ? fallback : name;
}
export class Folders {
  constructor(private root: string) {}
  private record(dir: string, key: string) {
    return join(
      this.root,
      'locations',
      createHash('sha256')
        .update(dir + '|' + key)
        .digest('hex'),
    );
  }
  async locate(dir: string, id: string) {
    try {
      const name = await readFile(this.record(dir, id), 'utf8');
      if (!name.includes('/') && !checkManifestPath(name)) return join(dir, name);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
    }
    return null;
  }
  async reserve(dir: string, id: string, label: string) {
    const existing = await this.locate(dir, id);
    if (existing) {
      await mkdir(existing, { recursive: true });
      if (!(await lstat(existing)).isDirectory()) throw new ClientError('FS_ERROR', 'Thư mục đã thay đổi.');
      return existing;
    }
    await mkdir(dir, { recursive: true });
    let name = segment(label, id);
    if (await exists(join(dir, name))) name += ' ' + id;
    await mkdir(join(dir, name));
    await writeAtomic(this.record(dir, id), name);
    return join(dir, name);
  }
  async installWork(dir: string, id: string, title: string, source: string, manifest: Manifest) {
    const previous = await this.locate(dir, id);
    if (previous && (await exists(previous))) return;
    const dest = await this.reserve(dir, id, title);
    // Reserve created an empty directory. rmdir refuses to remove user files.
    await rmdir(dest);
    await copyVerified(source, dest, manifest);
  }
  private versionFile(folder: string, id: string) {
    return this.record(folder, 'version-' + id);
  }
  async version(folder: string, student: StudentRef) {
    const dest = await this.locate(folder, student.id);
    if (!dest || !(await exists(dest))) return null;
    try {
      return Number(await readFile(this.versionFile(folder, student.id), 'utf8')) || null;
    } catch {
      return null;
    }
  }
  async replace(folder: string, student: StudentRef, dir: string, manifest: Manifest) {
    const label =
      student.mssv +
      '_' +
      student.fullName
        .normalize('NFD')
        .replace(/\p{M}/gu, '')
        .replace(/đ/g, 'd')
        .replace(/Đ/g, 'D')
        .replace(/\s+/g, '');
    const dest = await this.reserve(folder, student.id, label);
    const stage = join(folder, '.incoming-' + randomUUID());
    const backup = join(folder, '.previous-' + randomUUID());
    await copyVerified(dir, stage, manifest);
    await rename(dest, backup);
    try {
      await rename(stage, dest);
    } catch (e) {
      await rename(backup, dest);
      throw e;
    }
    await rm(backup, { recursive: true, force: true });
  }
  markVersion(folder: string, student: StudentRef, version: number) {
    return writeAtomic(this.versionFile(folder, student.id), String(version));
  }
}
