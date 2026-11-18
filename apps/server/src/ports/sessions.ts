import type { Role } from '@croc-classroom/shared';

/** Người gọi đã xác thực, gắn vào mỗi request cần đăng nhập. */
export interface AuthContext {
  userId: string;
  role: Role;
  sessionId: string;
}

export type SessionResolution =
  | { ok: true; auth: AuthContext }
  | { ok: false; code: 'UNAUTHENTICATED' | 'ACCOUNT_DISABLED' };

/**
 * Tra token phiên → người dùng. accounts (C, M1) triển khai bằng bảng `sessions`:
 * so khớp băm token, kiểm tra hạn, gia hạn trượt 30 ngày, từ chối tài khoản bị vô hiệu hoá.
 */
export interface SessionResolver {
  resolve(token: string): Promise<SessionResolution>;
}

/** Mặc định ở M0: chưa có phiên nào hợp lệ. */
export const rejectAllSessions: SessionResolver = {
  resolve: async () => ({ ok: false, code: 'UNAUTHENTICATED' }),
};
