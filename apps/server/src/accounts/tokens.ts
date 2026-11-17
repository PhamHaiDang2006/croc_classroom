import { createHash, randomBytes, randomInt } from 'node:crypto';
import { normalizeActivationCode } from '@croc-classroom/shared';

/** Token phiên: 32 byte ngẫu nhiên (256 bit), base64url. Chỉ client giữ bản gốc. */
export function generateSessionToken(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * Băm bí mật có entropy cao (token phiên, mã kích hoạt) bằng SHA-256. Không cần Argon2 vì bí mật
 * là ngẫu nhiên dài, không đoán theo từ điển được; Argon2 chỉ dùng cho mật khẩu do người đặt.
 */
export function hashSecret(secret: string): string {
  return createHash('sha256').update(secret, 'utf8').digest('hex');
}

const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** Mã kích hoạt 12 ký tự Crockford base32 (60 bit), hiển thị `XXXX-XXXX-XXXX`. */
export function generateActivationCode(): string {
  let raw = '';
  for (let i = 0; i < 12; i++) raw += CROCKFORD[randomInt(CROCKFORD.length)];
  return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8)}`;
}

/** Băm mã kích hoạt sau khi chuẩn hoá (bỏ gạch, khoảng trắng; O→0, I/L→1). */
export function hashActivationCode(code: string): string {
  return hashSecret(normalizeActivationCode(code));
}
