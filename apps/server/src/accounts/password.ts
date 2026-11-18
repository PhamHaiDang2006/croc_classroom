import { argon2, randomBytes, timingSafeEqual } from 'node:crypto';
import { appError } from '../http/errors.js';

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

/**
 * Giới hạn số lần băm Argon2 chạy cùng lúc. `crypto.argon2` chạy trên thread pool của libuv
 * (mặc định 4 luồng) — dùng chung với thao tác file; nếu để không giới hạn, một loạt yêu cầu đăng nhập
 * sẽ chiếm hết luồng, làm chậm cả server (review M0–M3). Hàng chờ đầy → RATE_LIMITED.
 */
export class HashGate {
  private active = 0;
  private readonly waiting: (() => void)[] = [];

  constructor(
    private readonly maxConcurrent: number,
    private readonly maxQueued: number,
  ) {}

  async run<T>(task: () => Promise<T>): Promise<T> {
    if (this.active >= this.maxConcurrent) {
      if (this.waiting.length >= this.maxQueued) {
        throw appError('RATE_LIMITED', 'Máy chủ đang bận, vui lòng thử lại', { retryAfterSeconds: 5 });
      }
      await new Promise<void>((resolve) => this.waiting.push(resolve));
    } else {
      this.active++;
    }
    try {
      return await task();
    } finally {
      // Giao lượt trực tiếp cho người chờ đầu tiên (giữ nguyên số đang chạy), hoặc giảm số đang chạy.
      const next = this.waiting.shift();
      if (next) next();
      else this.active--;
    }
  }

  get stats(): { active: number; waiting: number } {
    return { active: this.active, waiting: this.waiting.length };
  }
}

/** 2 lượt băm cùng lúc (chừa luồng cho thao tác file), tối đa 64 lượt chờ (~0,6 giây với tham số mặc định). */
const defaultGate = new HashGate(2, 64);

function derive(password: string, salt: Buffer, params: Argon2Params, tagLength: number): Promise<Buffer> {
  return defaultGate.run(
    () =>
      new Promise<Buffer>((resolve, reject) => {
        argon2(
          'argon2id',
          { message: Buffer.from(password, 'utf8'), nonce: salt, tagLength, ...params },
          (error, key) => (error ? reject(error) : resolve(key)),
        );
      }),
  );
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
