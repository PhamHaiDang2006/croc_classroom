import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ManifestSchema } from '@croc-classroom/shared';
import { computeManifest, ManifestError, manifestHash, verifyDirectory } from '@croc-classroom/shared/node';

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'croc-manifest-'));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

async function write(relative: string, content: string): Promise<void> {
  const full = join(root, relative);
  await mkdir(join(full, '..'), { recursive: true });
  await writeFile(full, content);
}

describe('computeManifest', () => {
  it('tính manifest cho thư mục nhiều cấp, tên tiếng Việt, file rỗng', async () => {
    await write('Đề bài.pdf', 'test');
    await write('du-lieu/hello.txt', 'hello\n');
    await write('du-lieu/trống.txt', '');

    const manifest = await computeManifest(root);

    expect(ManifestSchema.safeParse(manifest).success).toBe(true);
    expect(manifest.files).toEqual([
      { path: 'du-lieu/hello.txt', size: 6, sha256: '5891b5b522d5df086d0ff0b110fbd9d21bb4fc7163af34d08286a2e846f6be03' },
      { path: 'du-lieu/trống.txt', size: 0, sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855' },
      { path: 'Đề bài.pdf', size: 4, sha256: '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08' },
    ]);
  });

  it('chuẩn hoá tên file NFD (như macOS) về NFC', async () => {
    await write('Bài làm.txt'.normalize('NFD'), 'x');
    const manifest = await computeManifest(root);
    expect(manifest.files[0]?.path).toBe('Bài làm.txt'.normalize('NFC'));
  });

  it('từ chối symlink', async () => {
    await write('that.txt', 'x');
    await symlink(join(root, 'that.txt'), join(root, 'lien-ket.txt'));
    await expect(computeManifest(root)).rejects.toMatchObject({ code: 'SYMLINK_NOT_ALLOWED' });
  });

  it('từ chối thư mục rỗng và tên file không hợp lệ', async () => {
    await expect(computeManifest(root)).rejects.toBeInstanceOf(ManifestError);
    await write('bai?.txt', 'x');
    await expect(computeManifest(root)).rejects.toMatchObject({ code: 'INVALID_PATH' });
  });

  it('dừng khi vượt số file tối đa', async () => {
    await write('a.txt', '1');
    await write('b.txt', '2');
    await expect(computeManifest(root, { maxFiles: 1 })).rejects.toMatchObject({ code: 'TOO_MANY_FILES' });
  });
});

describe('verifyDirectory', () => {
  beforeEach(async () => {
    await write('a.txt', 'aaa');
    await write('thu-muc/b.txt', 'bbb');
  });

  it('đạt khi thư mục khớp manifest', async () => {
    const manifest = await computeManifest(root);
    await expect(verifyDirectory(root, manifest)).resolves.toEqual({ ok: true });
  });

  it('phát hiện thiếu, thừa, sai kích thước, sai hash', async () => {
    const manifest = await computeManifest(root);
    await rm(join(root, 'a.txt'));
    await write('thua.txt', 'x');
    await write('thu-muc/b.txt', 'bbX');
    await write('c.txt', 'c');
    const withC = { files: [...manifest.files, { path: 'c.txt', size: 1, sha256: '0'.repeat(64) }] };

    const result = await verifyDirectory(root, withC);

    expect(result.ok).toBe(false);
    const problems = result.ok ? [] : result.problems;
    expect(problems).toEqual(
      expect.arrayContaining([
        { kind: 'missing', path: 'a.txt' },
        { kind: 'extra', path: 'thua.txt' },
        { kind: 'hash_mismatch', path: 'thu-muc/b.txt' },
        { kind: 'hash_mismatch', path: 'c.txt' },
      ]),
    );
  });

  it('phát hiện sai kích thước mà không cần băm', async () => {
    const manifest = await computeManifest(root);
    await write('a.txt', 'dai hon');
    const result = await verifyDirectory(root, manifest);
    expect(result).toEqual({ ok: false, problems: [{ kind: 'size_mismatch', path: 'a.txt', expected: 3, actual: 7 }] });
  });

  it('coi symlink trong thư mục nhận là không hợp lệ', async () => {
    const manifest = await computeManifest(root);
    await symlink('/etc/hostname', join(root, 'lien-ket'));
    const result = await verifyDirectory(root, manifest);
    expect(result).toEqual({ ok: false, problems: [{ kind: 'not_regular_file', path: 'lien-ket' }] });
  });

  it('khớp tên NFD trên đĩa với manifest NFC', async () => {
    await rm(root, { recursive: true, force: true });
    await mkdir(root);
    await write('Đề.txt'.normalize('NFD'), 'x');
    const manifest = { files: [{ path: 'Đề.txt', size: 1, sha256: '2d711642b726b04401627ca9fbac32f5c8530fb1903cc4db02258717921a4881' }] };
    await expect(verifyDirectory(root, manifest)).resolves.toEqual({ ok: true });
  });
});

describe('manifestHash', () => {
  const files = [
    { path: 'b.txt', size: 1, sha256: '1'.repeat(64) },
    { path: 'a.txt', size: 2, sha256: '2'.repeat(64) },
  ];

  it('không phụ thuộc thứ tự file', () => {
    expect(manifestHash({ files })).toBe(manifestHash({ files: [...files].reverse() }));
    expect(manifestHash({ files })).toMatch(/^[0-9a-f]{64}$/);
  });

  it('đổi khi nội dung đổi', () => {
    const changed = [{ ...files[0]!, size: 3 }, files[1]!];
    expect(manifestHash({ files: changed })).not.toBe(manifestHash({ files }));
  });

  it('ổn định theo định dạng chuẩn v1 (giá trị tham chiếu cho mọi bên)', () => {
    // Tính độc lập bằng:
    // printf 'croc-classroom-manifest-v1\n<2×64> 2 a.txt\n<1×64> 1 b.txt\n' | sha256sum
    expect(manifestHash({ files })).toBe('980c764ca3aa1599867a7ce4436c2f412a179c1d7dc3e17494d727fd546c0379');
  });
});
