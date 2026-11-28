import { checkManifestLimits, type Manifest } from '@croc-classroom/shared';
import { appError } from './http/errors.js';

/**
 * Kiểm manifest theo giới hạn số file và tổng dung lượng (đề bài hoặc bài nộp).
 * Quá dung lượng → PAYLOAD_TOO_LARGE; quá số file → MANIFEST_INVALID.
 */
export function assertManifestWithinLimits(manifest: Manifest, limits: { maxFiles: number; maxBytes: number }): void {
  const problems = checkManifestLimits(manifest, limits);
  const tooLarge = problems.find((p) => p.code === 'too_large');
  if (tooLarge) throw appError('PAYLOAD_TOO_LARGE', tooLarge.message);
  const tooMany = problems.find((p) => p.code === 'too_many_files');
  if (tooMany) throw appError('MANIFEST_INVALID', tooMany.message);
}
