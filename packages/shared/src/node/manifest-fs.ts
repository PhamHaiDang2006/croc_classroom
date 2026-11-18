import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { lstat, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import {
  checkManifestPath,
  findManifestConflicts,
  MANIFEST_VERSION,
  toManifestPath,
  type Manifest,
  type ManifestEntry,
} from '../manifest.js';

export class ManifestError extends Error {
  constructor(
    readonly code: 'SYMLINK_NOT_ALLOWED' | 'NOT_REGULAR_FILE' | 'INVALID_PATH' | 'PATH_CONFLICT' | 'TOO_MANY_FILES' | 'EMPTY',
    message: string,
    readonly path?: string,
  ) {
    super(message);
    this.name = 'ManifestError';
  }
}

interface FoundFile {
  /** Đường dẫn manifest (NFC, dấu `/`). */
  path: string;
  /** Đường dẫn thật trên đĩa. */
  absolute: string;
  size: number;
}

export async function sha256File(absolutePath: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(absolutePath)) {
    hash.update(chunk as Buffer);
  }
  return hash.digest('hex');
}

/**
 * Duyệt cây thư mục, không đi theo symlink. Gặp symlink hoặc file đặc biệt thì ném ManifestError
 * (khi tính manifest) — hàm verify xử lý riêng để báo thành "thừa".
 */
async function walk(
  root: string,
  onSpecial: (segments: string[], kind: 'symlink' | 'special') => void,
  maxFiles: number,
): Promise<FoundFile[]> {
  const files: FoundFile[] = [];
  const stack: string[][] = [[]];
  while (stack.length > 0) {
    const segments = stack.pop()!;
    const dir = join(root, ...segments);
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const childSegments = [...segments, entry.name];
      const absolute = join(dir, entry.name);
      if (entry.isSymbolicLink()) {
        onSpecial(childSegments, 'symlink');
      } else if (entry.isDirectory()) {
        stack.push(childSegments);
      } else if (entry.isFile()) {
        const info = await lstat(absolute);
        files.push({ path: toManifestPath(childSegments), absolute, size: info.size });
        if (files.length > maxFiles) {
          throw new ManifestError('TOO_MANY_FILES', `Thư mục có hơn ${maxFiles} file`);
        }
      } else {
        onSpecial(childSegments, 'special');
      }
    }
  }
  return files;
}

/**
 * Tính manifest cho một thư mục gốc bộ file. Đọc file theo stream nên không nạp cả file vào bộ nhớ.
 * Ném ManifestError nếu gặp symlink, file đặc biệt, đường dẫn không hợp lệ hoặc trùng hoa/thường.
 */
export async function computeManifest(root: string, options: { maxFiles?: number } = {}): Promise<Manifest> {
  const maxFiles = options.maxFiles ?? Number.POSITIVE_INFINITY;
  const found = await walk(
    root,
    (segments, kind) => {
      const path = segments.join('/');
      throw kind === 'symlink'
        ? new ManifestError('SYMLINK_NOT_ALLOWED', `Không hỗ trợ symlink: ${path}`, path)
        : new ManifestError('NOT_REGULAR_FILE', `Không phải file thường: ${path}`, path);
    },
    maxFiles,
  );
  if (found.length === 0) throw new ManifestError('EMPTY', 'Thư mục không có file nào');

  for (const file of found) {
    const problem = checkManifestPath(file.path);
    if (problem) throw new ManifestError('INVALID_PATH', `${file.path}: ${problem}`, file.path);
  }
  const conflicts = findManifestConflicts(found);
  if (conflicts.length > 0) {
    const first = conflicts[0]!;
    const path = found[first.index]!.path;
    throw new ManifestError('PATH_CONFLICT', `${path}: ${first.message}`, path);
  }

  const files: ManifestEntry[] = [];
  for (const file of found) {
    files.push({ path: file.path, size: file.size, sha256: await sha256File(file.absolute) });
  }
  files.sort((a, b) => comparePaths(a.path, b.path));
  return { version: MANIFEST_VERSION, files };
}

export type VerifyProblem =
  | { kind: 'missing'; path: string }
  | { kind: 'extra'; path: string }
  | { kind: 'size_mismatch'; path: string; expected: number; actual: number }
  | { kind: 'hash_mismatch'; path: string }
  | { kind: 'not_regular_file'; path: string }
  /**
   * Hai file trên đĩa có cùng đường dẫn sau khi chuẩn hoá NFC (ví dụ `Đề.txt` dạng NFC và dạng NFD —
   * Linux, Windows cho phép cùng tồn tại). Không xác định được file nào là bản đúng → coi là lỗi.
   */
  | { kind: 'duplicate'; path: string };

export type VerifyResult = { ok: true } | { ok: false; problems: VerifyProblem[] };

/**
 * Xác minh một thư mục theo manifest: thiếu file, thừa file (kể cả symlink, file đặc biệt), sai kích
 * thước, sai SHA-256, hai file trùng tên sau chuẩn hoá. Tên file trên đĩa được chuẩn hoá NFC trước khi
 * so (macOS lưu dạng NFD). Thư mục rỗng thừa không bị coi là lỗi. Kiểm tra kích thước trước, chỉ băm
 * khi kích thước khớp.
 */
export async function verifyDirectory(root: string, manifest: Pick<Manifest, 'files'>): Promise<VerifyResult> {
  const problems: VerifyProblem[] = [];
  const found = await walk(
    root,
    (segments) => problems.push({ kind: 'not_regular_file', path: toManifestPath(segments) }),
    Number.POSITIVE_INFINITY,
  );

  // Không được để file sau ghi đè file trước trong Map: file giả mang tên NFD trùng với tên NFC của
  // file đúng sẽ lọt qua kiểm tra "thừa" (review M0–M3, lỗi critical).
  const onDisk = new Map<string, FoundFile>();
  for (const file of found) {
    if (onDisk.has(file.path)) problems.push({ kind: 'duplicate', path: file.path });
    else onDisk.set(file.path, file);
  }

  const expected = new Set<string>();
  for (const entry of manifest.files) {
    expected.add(entry.path);
    const file = onDisk.get(entry.path);
    if (!file) {
      problems.push({ kind: 'missing', path: entry.path });
    } else if (file.size !== entry.size) {
      problems.push({ kind: 'size_mismatch', path: entry.path, expected: entry.size, actual: file.size });
    } else if ((await sha256File(file.absolute)) !== entry.sha256) {
      problems.push({ kind: 'hash_mismatch', path: entry.path });
    }
  }
  for (const file of found) {
    if (!expected.has(file.path)) problems.push({ kind: 'extra', path: file.path });
  }
  return problems.length === 0 ? { ok: true } : { ok: false, problems };
}

/** So sánh đường dẫn theo thứ tự byte UTF-8 (ổn định giữa các ngôn ngữ lập trình). */
export function comparePaths(a: string, b: string): number {
  return Buffer.compare(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'));
}

const MANIFEST_HASH_HEADER = 'croc-classroom-manifest-v1\n';

/**
 * Mã băm tổng của manifest, dùng trong biên nhận nộp bài.
 * Dạng chuẩn: dòng tiêu đề `croc-classroom-manifest-v1`, rồi mỗi file một dòng
 * `<sha256> <size> <path>\n`, sắp theo đường dẫn (byte UTF-8). Băm SHA-256 toàn bộ chuỗi UTF-8.
 */
export function manifestHash(manifest: Pick<Manifest, 'files'>): string {
  const lines = [...manifest.files]
    .sort((a, b) => comparePaths(a.path, b.path))
    .map((f) => `${f.sha256} ${f.size} ${f.path}\n`);
  return createHash('sha256')
    .update(MANIFEST_HASH_HEADER + lines.join(''), 'utf8')
    .digest('hex');
}
