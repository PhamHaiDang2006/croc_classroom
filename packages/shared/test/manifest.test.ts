import { describe, expect, it } from 'vitest';
import {
  checkManifestLimits,
  checkManifestPath,
  ManifestSchema,
  manifestTotalSize,
  toManifestPath,
} from '@croc-classroom/shared';

const SHA = 'a'.repeat(64);
const entry = (path: string, size = 1) => ({ path, size, sha256: SHA });

describe('checkManifestPath', () => {
  it.each(['a.txt', 'Đề bài.pdf', 'du-lieu/thu-muc/file.c', 'tên có dấu cách.txt', '.gitkeep', 'a..b.txt', 'console.log'])(
    'chấp nhận %s',
    (path) => {
      expect(checkManifestPath(path)).toBeNull();
    },
  );

  it.each([
    ['', 'rỗng'],
    ['/etc/passwd', 'tuyệt đối'],
    ['../ngoai.txt', '..'],
    ['a/../../b', '..'],
    ['a/./b', '.'],
    ['a//b', 'đoạn rỗng'],
    ['a\\b.txt', 'gạch ngược'],
    ['C:/x.txt', 'ổ đĩa Windows'],
    ['bai?.txt', 'ký tự Windows cấm'],
    ['ten.', 'kết thúc bằng dấu chấm'],
    ['ten ', 'kết thúc bằng dấu cách'],
    ['CON', 'tên dành riêng'],
    ['du-lieu/con/file.c', 'thư mục "con" (từ tiếng Việt nhưng Windows không tạo được)'],
    ['thu-muc/nul.txt', 'tên dành riêng có đuôi'],
    ['a\u0001b', 'ký tự điều khiển'],
    ['x'.repeat(256), 'đoạn quá dài'],
  ])('từ chối %j (%s)', (path) => {
    expect(checkManifestPath(path)).not.toBeNull();
  });

  it('từ chối tên tiếng Việt dạng NFD (như macOS lưu) nếu chưa chuẩn hoá', () => {
    const nfd = 'Đề bài.pdf'.normalize('NFD');
    expect(nfd).not.toBe('Đề bài.pdf');
    expect(checkManifestPath(nfd)).toMatch(/NFC/);
    expect(checkManifestPath(toManifestPath([nfd]))).toBeNull();
  });
});

describe('ManifestSchema', () => {
  it('chấp nhận manifest hợp lệ', () => {
    const manifest = { version: 1, files: [entry('a.txt'), entry('b/c.txt', 0)] };
    expect(ManifestSchema.parse(manifest)).toEqual(manifest);
  });

  it('từ chối manifest rỗng', () => {
    expect(ManifestSchema.safeParse({ version: 1, files: [] }).success).toBe(false);
  });

  it('từ chối hai đường dẫn chỉ khác hoa/thường', () => {
    const result = ManifestSchema.safeParse({ version: 1, files: [entry('Bai.txt'), entry('bai.txt')] });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['files', 1, 'path']);
  });

  it('từ chối đường dẫn vừa là file vừa là thư mục', () => {
    const result = ManifestSchema.safeParse({ version: 1, files: [entry('a'), entry('A/b.txt')] });
    expect(result.success).toBe(false);
  });

  it('từ chối sha256 sai định dạng và kích thước âm', () => {
    expect(ManifestSchema.safeParse({ version: 1, files: [{ path: 'a', size: 1, sha256: 'ABC' }] }).success).toBe(false);
    expect(ManifestSchema.safeParse({ version: 1, files: [{ path: 'a', size: -1, sha256: SHA }] }).success).toBe(false);
  });

  it('từ chối phiên bản manifest lạ', () => {
    expect(ManifestSchema.safeParse({ version: 2, files: [entry('a')] }).success).toBe(false);
  });
});

describe('giới hạn manifest', () => {
  it('tính tổng dung lượng và báo vượt giới hạn', () => {
    const manifest = { files: [entry('a', 600), entry('b', 500)] };
    expect(manifestTotalSize(manifest)).toBe(1100);
    expect(checkManifestLimits(manifest, { maxFiles: 10, maxBytes: 2000 })).toEqual([]);
    expect(checkManifestLimits(manifest, { maxFiles: 1, maxBytes: 1000 }).map((p) => p.code)).toEqual([
      'too_many_files',
      'too_large',
    ]);
  });
});
