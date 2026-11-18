import { z } from 'zod';

/**
 * Manifest — danh sách file của một bộ file (đề hoặc bài nộp). Server giữ manifest; đây là
 * nguồn sự thật để xác minh file nhận được (system-design mục 6, 8).
 *
 * Quy tắc (hợp đồng v1, xem docs/contracts.md):
 * - `path` tương đối so với gốc bộ file (payload root — croc-engine định nghĩa), dấu `/`,
 *   chuẩn Unicode NFC. Không rỗng, không `.`/`..`, không bắt đầu bằng `/`.
 * - Cấm ký tự điều khiển, `\` và các ký tự Windows không cho phép `<>:"|?*`; đoạn đường dẫn
 *   không kết thúc bằng dấu cách hay dấu chấm; không dùng tên dành riêng của Windows (CON, NUL…).
 * - Hai đường dẫn không được trùng nhau khi bỏ qua hoa/thường (Windows, macOS không phân biệt).
 * - Một đường dẫn không được vừa là file vừa là thư mục cha của file khác.
 * - Chỉ liệt kê file thường. Thư mục rỗng không được truyền. Symlink không được phép.
 * - Thứ tự `files` không quan trọng; mã băm tổng sắp xếp lại (xem node/manifest-fs.ts).
 */

export const MANIFEST_VERSION = 1;
export const MAX_PATH_LENGTH = 1024;
export const MAX_SEGMENT_LENGTH = 255;

const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(\..*)?$/i;
// eslint-disable-next-line no-control-regex
const FORBIDDEN_CHARS = /[\u0000-\u001f\u007f<>:"|?*\\]/;

/** Trả về lý do sai, hoặc null nếu đường dẫn hợp lệ theo quy tắc manifest. */
export function checkManifestPath(path: string): string | null {
  if (path.length === 0) return 'Đường dẫn rỗng';
  if (path.length > MAX_PATH_LENGTH) return `Đường dẫn dài hơn ${MAX_PATH_LENGTH} ký tự`;
  if (path !== path.normalize('NFC')) return 'Đường dẫn chưa ở dạng Unicode NFC';
  if (FORBIDDEN_CHARS.test(path)) return 'Đường dẫn chứa ký tự không được phép';
  if (path.startsWith('/')) return 'Đường dẫn tuyệt đối không được phép';
  for (const segment of path.split('/')) {
    if (segment === '') return 'Đường dẫn có đoạn rỗng';
    if (segment === '.' || segment === '..') return 'Đường dẫn chứa "." hoặc ".."';
    if (segment.length > MAX_SEGMENT_LENGTH) return `Tên file/thư mục dài hơn ${MAX_SEGMENT_LENGTH} ký tự`;
    if (segment.endsWith(' ') || segment.endsWith('.')) return 'Tên file/thư mục kết thúc bằng dấu cách hoặc dấu chấm';
    if (WINDOWS_RESERVED.test(segment)) return `"${segment}" là tên dành riêng trên Windows`;
  }
  return null;
}

/** Ghép các đoạn đường dẫn (đã tách theo dấu phân cách của hệ điều hành) thành đường dẫn manifest. */
export function toManifestPath(segments: readonly string[]): string {
  return segments.map((s) => s.normalize('NFC')).join('/');
}

/** Khoá so sánh không phân biệt hoa/thường, dùng để phát hiện trùng trên hệ thống file không phân biệt hoa thường. */
export function manifestPathKey(path: string): string {
  return path.normalize('NFC').toLowerCase();
}

export const Sha256HexSchema = z.string().regex(/^[0-9a-f]{64}$/, 'SHA-256 phải là 64 ký tự hex thường');

export const ManifestEntrySchema = z.object({
  path: z.string().superRefine((value, ctx) => {
    const problem = checkManifestPath(value);
    if (problem) ctx.addIssue({ code: 'custom', message: problem });
  }),
  size: z.int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  sha256: Sha256HexSchema,
});
export type ManifestEntry = z.infer<typeof ManifestEntrySchema>;

export const ManifestSchema = z
  .object({
    version: z.literal(MANIFEST_VERSION),
    files: z.array(ManifestEntrySchema).min(1, 'Manifest phải có ít nhất một file'),
  })
  .superRefine((manifest, ctx) => {
    for (const problem of findManifestConflicts(manifest.files)) {
      ctx.addIssue({ code: 'custom', message: problem.message, path: ['files', problem.index, 'path'] });
    }
  });
export type Manifest = z.infer<typeof ManifestSchema>;

export interface ManifestConflict {
  index: number;
  message: string;
}

/** Tìm đường dẫn trùng (không phân biệt hoa thường) và xung đột file/thư mục. */
export function findManifestConflicts(files: readonly Pick<ManifestEntry, 'path'>[]): ManifestConflict[] {
  const conflicts: ManifestConflict[] = [];
  const seen = new Map<string, number>();
  files.forEach((file, index) => {
    const key = manifestPathKey(file.path);
    const first = seen.get(key);
    if (first !== undefined) {
      conflicts.push({ index, message: `Trùng đường dẫn với file thứ ${first} (không phân biệt hoa/thường)` });
    } else {
      seen.set(key, index);
    }
  });
  files.forEach((file, index) => {
    const segments = manifestPathKey(file.path).split('/');
    for (let i = 1; i < segments.length; i++) {
      const parent = segments.slice(0, i).join('/');
      const clash = seen.get(parent);
      if (clash !== undefined) {
        conflicts.push({ index, message: `Thư mục cha "${parent}" trùng với file thứ ${clash}` });
        break;
      }
    }
  });
  return conflicts;
}

export function manifestTotalSize(manifest: Pick<Manifest, 'files'>): number {
  return manifest.files.reduce((sum, file) => sum + file.size, 0);
}

/**
 * Kiểm tra manifest theo giới hạn số file và dung lượng của từng loại bộ file.
 * Trả về danh sách lỗi (rỗng nếu đạt). Dùng ở server (bắt buộc) và ở app (báo sớm cho người dùng).
 */
export function checkManifestLimits(
  manifest: Pick<Manifest, 'files'>,
  limits: { maxFiles: number; maxBytes: number },
): { code: 'too_many_files' | 'too_large'; message: string }[] {
  const problems: { code: 'too_many_files' | 'too_large'; message: string }[] = [];
  if (manifest.files.length > limits.maxFiles) {
    problems.push({ code: 'too_many_files', message: `Quá ${limits.maxFiles} file` });
  }
  const total = manifestTotalSize(manifest);
  if (total > limits.maxBytes) {
    problems.push({ code: 'too_large', message: `Tổng dung lượng ${total} byte vượt giới hạn ${limits.maxBytes} byte` });
  }
  return problems;
}
