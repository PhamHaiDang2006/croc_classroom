import { randomUUID } from 'node:crypto';
import type { Role } from '@croc-classroom/shared';
import type { Db } from '../db/index.js';
import type { Clock } from '../ports/clock.js';
import type { SessionResolution, SessionResolver } from '../ports/sessions.js';
import { generateSessionToken, hashSecret } from './tokens.js';

/** Hạn trượt 30 ngày (system-design mục 8). */
export const SESSION_TTL_MS = 30 * 24 * 60 * 60_000;
/** Chỉ ghi lại last_seen/expires tối đa mỗi phút một lần để giảm ghi CSDL. */
const TOUCH_INTERVAL_MS = 60_000;

interface SessionRow {
  id: string;
  user_id: string;
  expires_at: string;
  last_seen_at: string;
  role: Role;
  disabled: number;
}

export interface CreatedSession {
  sessionId: string;
  token: string;
  expiresAt: string;
}

/**
 * Phiên đăng nhập trong bảng `sessions`. Server chỉ lưu SHA-256 của token.
 * Triển khai SessionResolver cho registerEndpoint (và cho WebSocket của D).
 */
export class SessionService implements SessionResolver {
  private readonly revokedListeners = new Set<(userId: string) => void>();

  constructor(
    private readonly db: Db,
    private readonly clock: Clock,
  ) {}

  create(userId: string, deviceName?: string): CreatedSession {
    const now = this.clock.now();
    const token = generateSessionToken();
    const session = {
      id: randomUUID(),
      user_id: userId,
      token_hash: hashSecret(token),
      device_name: deviceName ?? null,
      created_at: now.toISOString(),
      last_seen_at: now.toISOString(),
      expires_at: new Date(now.getTime() + SESSION_TTL_MS).toISOString(),
    };
    this.db
      .prepare(
        `INSERT INTO sessions (id, user_id, token_hash, device_name, created_at, last_seen_at, expires_at)
         VALUES (@id, @user_id, @token_hash, @device_name, @created_at, @last_seen_at, @expires_at)`,
      )
      .run(session);
    return { sessionId: session.id, token, expiresAt: session.expires_at };
  }

  async resolve(token: string): Promise<SessionResolution> {
    const row = this.db
      .prepare(
        `SELECT s.id, s.user_id, s.expires_at, s.last_seen_at, u.role, u.disabled
         FROM sessions s JOIN users u ON u.id = s.user_id
         WHERE s.token_hash = ?`,
      )
      .get(hashSecret(token)) as SessionRow | undefined;
    if (!row) return { ok: false, code: 'UNAUTHENTICATED' };

    const now = this.clock.now().getTime();
    if (Date.parse(row.expires_at) <= now) {
      this.revoke(row.id);
      return { ok: false, code: 'UNAUTHENTICATED' };
    }
    if (row.disabled) return { ok: false, code: 'ACCOUNT_DISABLED' };

    if (now - Date.parse(row.last_seen_at) >= TOUCH_INTERVAL_MS) {
      this.db
        .prepare('UPDATE sessions SET last_seen_at = ?, expires_at = ? WHERE id = ?')
        .run(new Date(now).toISOString(), new Date(now + SESSION_TTL_MS).toISOString(), row.id);
    }
    return { ok: true, auth: { userId: row.user_id, role: row.role, sessionId: row.id } };
  }

  revoke(sessionId: string): void {
    this.db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
  }

  /** Đăng xuất bằng token: không có hoặc đã hết hạn thì bỏ qua. */
  revokeByToken(token: string): void {
    this.db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hashSecret(token));
  }

  /** Thu hồi mọi phiên của một người (vô hiệu hoá, kích hoạt lại, đổi mật khẩu GV). */
  revokeAllForUser(userId: string): void {
    this.db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
    for (const listener of this.revokedListeners) listener(userId);
  }

  /**
   * Báo khi mọi phiên của một người bị thu hồi — D dùng để đóng kết nối WebSocket đang mở
   * (mã WS_CLOSE.revoked). Trả về hàm huỷ đăng ký.
   */
  onUserSessionsRevoked(listener: (userId: string) => void): () => void {
    this.revokedListeners.add(listener);
    return () => this.revokedListeners.delete(listener);
  }

  /** Xoá phiên đã hết hạn. Gọi khi khởi động server. */
  purgeExpired(): number {
    return this.db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(this.clock.now().toISOString()).changes;
  }
}
