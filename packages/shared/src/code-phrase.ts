import { z } from 'zod';

/**
 * Code phrase (mã bài) GV đưa cho lớp, dạng `tu-tu-tu-NNN`, ví dụ `sao-mai-xanh-042`.
 * Ba từ lấy từ danh sách 128 từ + số 000–999 ⇒ 3·7 + log2(1000) ≈ 31 bit (yêu cầu ≥ ~30 bit).
 * Sinh ở server bằng generateCodePhrase (shared/node). Không phân biệt hoa thường khi so sánh.
 */
export const CODE_PHRASE_PATTERN = /^[a-z]{2,6}-[a-z]{2,6}-[a-z]{2,6}-\d{3}$/;

/** Chuẩn hoá chuỗi người dùng gõ: bỏ khoảng trắng hai đầu, chữ thường, khoảng trắng/gạch dưới → `-`. */
export function normalizeCodePhrase(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-');
}

export function isCodePhraseFormat(input: string): boolean {
  return CODE_PHRASE_PATTERN.test(normalizeCodePhrase(input));
}

/** Schema đầu vào: chấp nhận cách gõ lỏng, trả về dạng đã chuẩn hoá. */
export const CodePhraseInputSchema = z
  .string()
  .max(64)
  .transform(normalizeCodePhrase)
  .pipe(z.string().regex(CODE_PHRASE_PATTERN, 'Code không đúng định dạng'));

/** Code phrase do server trả về (luôn ở dạng chuẩn). */
export const CodePhraseSchema = z.string().regex(CODE_PHRASE_PATTERN);
