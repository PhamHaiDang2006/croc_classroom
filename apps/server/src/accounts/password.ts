import { argon2, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Băm mật khẩu bằng Argon2id có sẵn trong Node.js 24 (`crypto.argon2`, RFC 9106) — không cần
 * thư viện native. Lưu dạng chuỗi PHC: `$argon2id$v=19$m=<KiB>,t=<lượt>,p=<luồng>$<salt>$<hash>`
 * (base64 không đệm), tương thích các thư viện argon2 khác nếu sau này cần đổi.
 */

export interface Argon2Params {
  /** Bộ nhớ, đơn vị KiB. */
  memory: number;
  passes: number;
  parallelism: number;
}

/** Mức tối thiểu OWASP khuyến nghị cho Argon2id (19 MiB, 2 lượt, 1 luồng); khoảng 20–40 ms mỗi lần băm. */
export const DEFAULT_ARGON2_PARAMS: Argon2Params = { memory: 19456, passes: 2, parallelism: 1 };

const SALT_BYTES = 16;
const TAG_BYTES = 32;
const ARGON2_VERSION = 19;

function derive(password: string, salt: Buffer, params: Argon2Params, tagLength: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    argon2(
      'argon2id',
      { message: Buffer.from(password, 'utf8'), nonce: salt, tagLength, ...params },
      (error, key) => (error ? reject(error) : resolve(key)),
    );
  });
}

const b64 = (buf: Buffer) => buf.toString('base64').replace(/=+$/, '');

export async function hashPassword(password: string, params: Argon2Params = DEFAULT_ARGON2_PARAMS): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const tag = await derive(password, salt, params, TAG_BYTES);
  return `$argon2id$v=${ARGON2_VERSION}$m=${params.memory},t=${params.passes},p=${params.parallelism}$${b64(salt)}$${b64(tag)}`;
}

const PHC = /^\$argon2id\$v=(\d+)\$m=(\d+),t=(\d+),p=(\d+)\$([A-Za-z0-9+/]+)\$([A-Za-z0-9+/]+)$/;

/** So mật khẩu với chuỗi PHC đã lưu, so sánh thời gian hằng. Chuỗi hỏng → false. */
export async function verifyPassword(stored: string, password: string): Promise<boolean> {
  const match = PHC.exec(stored);
  if (!match || Number(match[1]) !== ARGON2_VERSION) return false;
  const params: Argon2Params = { memory: Number(match[2]), passes: Number(match[3]), parallelism: Number(match[4]) };
  const salt = Buffer.from(match[5]!, 'base64');
  const expected = Buffer.from(match[6]!, 'base64');
  const actual = await derive(password, salt, params, expected.length);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/**
 * Băm giả để so khi không tìm thấy tài khoản, giúp thời gian phản hồi giống khi sai mật khẩu
 * (không lộ MSSV/username nào tồn tại qua thời gian đáp ứng).
 */
export function createDummyHash(params: Argon2Params = DEFAULT_ARGON2_PARAMS): () => Promise<string> {
  let cached: Promise<string> | undefined;
  return () => (cached ??= hashPassword(randomBytes(16).toString('hex'), params));
}
