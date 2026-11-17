import type { Clock } from '../ports/clock.js';
import { appError } from './errors.js';

/**
 * Đếm số lần THẤT BẠI theo khoá trong một cửa sổ thời gian cố định (system-design mục 8:
 * ví dụ 10 lần sai / 5 phút / (tài khoản + IP)). Giữ trong bộ nhớ: một server, khởi động lại thì
 * đếm lại từ đầu — chấp nhận được vì cửa sổ chỉ vài phút.
 *
 * Cách dùng: `assertAllowed(keys)` trước khi xử lý (chặn sớm, không tốn băm mật khẩu),
 * `recordFailure(keys)` khi sai, `reset(key)` khi thành công.
 */
export interface RateLimitRule {
  maxFailures: number;
  windowMs: number;
}

interface Window {
  count: number;
  resetAt: number;
}

export class FailureLimiter {
  private readonly windows = new Map<string, Window>();

  constructor(
    private readonly rule: RateLimitRule,
    private readonly clock: Clock,
  ) {}

  /** Số giây phải chờ nếu khoá đang bị chặn, ngược lại 0. */
  retryAfterSeconds(key: string): number {
    const now = this.clock.now().getTime();
    const window = this.windows.get(key);
    if (!window || window.resetAt <= now) return 0;
    return window.count >= this.rule.maxFailures ? Math.ceil((window.resetAt - now) / 1000) : 0;
  }

  /** Ném RATE_LIMITED (kèm retryAfterSeconds) nếu một trong các khoá đang bị chặn. */
  assertAllowed(...keys: string[]): void {
    const wait = Math.max(0, ...keys.map((key) => this.retryAfterSeconds(key)));
    if (wait > 0) throw appError('RATE_LIMITED', undefined, { retryAfterSeconds: wait });
  }

  recordFailure(...keys: string[]): void {
    const now = this.clock.now().getTime();
    this.prune(now);
    for (const key of keys) {
      const window = this.windows.get(key);
      if (!window || window.resetAt <= now) {
        this.windows.set(key, { count: 1, resetAt: now + this.rule.windowMs });
      } else {
        window.count += 1;
      }
    }
  }

  reset(key: string): void {
    this.windows.delete(key);
  }

  private prune(now: number): void {
    if (this.windows.size < 10_000) return;
    for (const [key, window] of this.windows) if (window.resetAt <= now) this.windows.delete(key);
  }
}

/**
 * 10 lần sai / 5 phút cho mỗi (tài khoản + IP) — system-design mục 8.
 * Cố ý KHÔNG giới hạn riêng theo IP: cả lớp thường chung một IP công khai (NAT của trường),
 * giới hạn theo IP sẽ khoá cả lớp khi nhiều SV gõ sai mật khẩu cùng lúc đầu giờ.
 */
export const ACCOUNT_FAILURE_RULE: RateLimitRule = { maxFailures: 10, windowMs: 5 * 60_000 };
