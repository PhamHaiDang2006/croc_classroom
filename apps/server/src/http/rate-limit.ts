import type { Clock } from '../ports/clock.js';
import { appError } from './errors.js';

/**
 * Đếm số lần THẤT BẠI theo khoá trong một cửa sổ thời gian cố định (system-design mục 8:
 * ví dụ 10 lần sai / 5 phút / (tài khoản + IP)). Giữ trong bộ nhớ: một server, khởi động lại thì
 * đếm lại từ đầu — chấp nhận được vì cửa sổ chỉ vài phút.
 *
 * Cách dùng: `assertAllowed(keys)` trước khi xử lý (chặn sớm, không tốn băm mật khẩu),
 * `recordFailure(keys)` khi sai, `reset(key)` khi thành công. Nếu giữa kiểm tra và kết luận có `await`
 * (băm mật khẩu), phải ghi trước rồi `refund(key)` khi lần thử không sai — nếu không, các yêu cầu song
 * song cùng lọt qua `assertAllowed` (review C/Backend: 100 yêu cầu song song → 66 lần đoán thay vì 10).
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

  /**
   * Trả lại một lần đã ghi bằng recordFailure. Dùng khi ghi trước một lần thử (để các yêu cầu chạy song
   * song không cùng lọt qua assertAllowed trong lúc chờ băm mật khẩu) rồi hoá ra lần thử không sai.
   */
  refund(key: string): void {
    const window = this.windows.get(key);
    if (!window || window.resetAt <= this.clock.now().getTime()) return;
    window.count -= 1;
    if (window.count <= 0) this.windows.delete(key);
  }

  private prune(now: number): void {
    if (this.windows.size < 10_000) return;
    for (const [key, window] of this.windows) if (window.resetAt <= now) this.windows.delete(key);
  }
}

/**
 * 10 lần sai / 5 phút cho mỗi (tài khoản + nhóm IP) — system-design mục 8.
 */
export const ACCOUNT_FAILURE_RULE: RateLimitRule = { maxFailures: 10, windowMs: 5 * 60_000 };

/**
 * Trần theo nhóm IP, cộng mọi tài khoản: chặn dò mật khẩu hàng loạt và làm nghẽn CPU bằng Argon2.
 * Đặt rất cao vì cả lớp thường chung một IP công khai (NAT của trường): 60 SV gõ sai vài lần đầu giờ
 * chỉ vài chục đến vài trăm lần, còn xa mức này.
 */
export const IP_FAILURE_RULE: RateLimitRule = { maxFailures: 1000, windowMs: 5 * 60_000 };

/**
 * Khoá dùng để đếm theo IP. IPv4 giữ nguyên; IPv6 lấy dải /64 (một máy/mạng nhà thường có cả dải /64
 * và đổi địa chỉ trong dải tuỳ ý, nên đếm theo từng địa chỉ thì vượt giới hạn dễ dàng). Địa chỉ IPv4
 * dạng `::ffff:a.b.c.d` coi như IPv4; bỏ phần zone `%eth0`.
 */
export function ipBucket(ip: string): string {
  const address = ip.split('%')[0]!.toLowerCase();
  if (!address.includes(':')) return address;
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(address);
  if (mapped) return mapped[1]!;

  const [headPart, tailPart] = address.split('::') as [string, string | undefined];
  const groupsOf = (part: string | undefined): string[] =>
    part ? part.split(':').flatMap((g) => (g.includes('.') ? ['0', '0'] : [g])) : [];
  const head = groupsOf(headPart);
  const tail = groupsOf(tailPart);
  const groups = tailPart === undefined ? head : [...head, ...Array<string>(Math.max(0, 8 - head.length - tail.length)).fill('0'), ...tail];
  const prefix = groups.slice(0, 4).map((g) => (Number.parseInt(g || '0', 16) || 0).toString(16));
  return `${prefix.join(':')}::/64`;
}
