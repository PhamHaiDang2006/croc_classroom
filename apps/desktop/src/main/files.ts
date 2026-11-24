import { cp, mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile, lstat } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { computeManifest, verifyDirectory } from '@croc-classroom/shared/node';
import { ManifestSchema, IdSchema, manifestTotalSize, type Manifest } from '@croc-classroom/shared';
import { ClientError } from './rest.js';

export async function writeAtomic(file: string, data: string | Buffer) {
  await mkdir(dirname(file), { recursive: true });
  const temp = file + '.' + randomUUID();
  try {
    await writeFile(temp, data, { mode: 0o600 });
    await rename(temp, file);
  } finally {
    await rm(temp, { force: true });
  }
}
export async function exists(path: string) {
  try {
    await lstat(path);
    return true;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw e;
  }
}
export async function verify(dir: string, manifest: Manifest) {
  if (!(await verifyDirectory(dir, manifest)).ok)
    throw new ClientError('MANIFEST_INVALID', 'Nội dung file không khớp manifest.');
}
export async function copyVerified(source: string, dest: string, manifest: Manifest) {
  await mkdir(dirname(dest), { recursive: true });
  const stage = await mkdtemp(join(dirname(dest), '.copy-'));
  try {
    await cp(source, stage, { recursive: true });
    await verify(stage, manifest);
    await rename(stage, dest);
  } finally {
    await rm(stage, { recursive: true, force: true });
  }
}
export class LocalFiles {
  readonly selections = new Map<string, { dir: string; manifest: Manifest }>();
  readonly holdings = new Map<string, Manifest>();
  constructor(
    readonly root: string,
    readonly temp: string,
  ) {}
  cache(id: string) {
    return join(this.root, 'cache', IdSchema.parse(id), 'payload');
  }
  async restore() {
    const base = join(this.root, 'cache');
    await mkdir(base, { recursive: true });
    for (const id of await readdir(base)) {
      if (!IdSchema.safeParse(id).success) continue;
      try {
        const manifest = ManifestSchema.parse(
          JSON.parse(await readFile(join(base, id, 'manifest.json'), 'utf8')),
        );
        await verify(this.cache(id), manifest);
        this.holdings.set(id, manifest);
      } catch {
        await this.clear(id);
      }
    }
  }
  async select(paths: string[], directory: boolean) {
    const selectionId = randomUUID();
    const dir = join(this.temp, selectionId);
    await mkdir(dir);
    try {
      if (directory) {
        if (!(await lstat(paths[0]!)).isDirectory())
          throw new ClientError('INVALID_INPUT', 'Hãy chọn thư mục thường.');
        const manifest = await computeManifest(paths[0]!);
        await cp(paths[0]!, dir, { recursive: true });
        await verify(dir, manifest);
      } else {
        for (const path of paths) {
          if (!(await lstat(path)).isFile()) throw new ClientError('INVALID_INPUT', 'Chọn file thường.');
          await cp(path, join(dir, basename(path)), { force: false, errorOnExist: true });
        }
      }
      const manifest = await computeManifest(dir);
      this.selections.set(selectionId, { dir, manifest });
      return {
        selectionId,
        label: basename(paths[0]!),
        fileCount: manifest.files.length,
        totalSize: manifestTotalSize(manifest),
      };
    } catch (e) {
      await rm(dir, { recursive: true, force: true });
      throw e;
    }
  }
  selected(id: string) {
    const value = this.selections.get(id);
    if (!value) throw new ClientError('SELECTION_EXPIRED', 'Hãy chọn lại file.');
    return value;
  }
  async keep(id: string, source: string, manifest: Manifest) {
    if (this.holdings.has(id)) {
      try {
        await verify(this.cache(id), manifest);
        return;
      } catch {
        await this.clear(id);
      }
    }
    await copyVerified(source, this.cache(id), manifest);
    await writeAtomic(join(dirname(this.cache(id)), 'manifest.json'), JSON.stringify(manifest));
    this.holdings.set(id, manifest);
  }
  async clear(id: string) {
    this.holdings.delete(id);
    await rm(dirname(this.cache(id)), { recursive: true, force: true });
  }
}
