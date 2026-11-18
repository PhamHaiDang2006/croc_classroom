import { z } from 'zod';

/** ID mọi thực thể: UUID do server sinh (crypto.randomUUID()). Client coi là chuỗi mờ. */
export const IdSchema = z.uuid();
export type Id = z.infer<typeof IdSchema>;

/** Thời điểm: chuỗi ISO 8601 theo UTC, có hậu tố `Z` (ví dụ `2026-11-17T08:00:00.000Z`). */
export const TimestampSchema = z.iso.datetime();
export type Timestamp = z.infer<typeof TimestampSchema>;

/** Subnet LAN dạng CIDR (IPv4 hoặc IPv6), ví dụ `192.168.1.0/24`. */
export const CidrSchema = z.union([z.cidrv4(), z.cidrv6()]);

/**
 * MSSV: chữ và số, có thể có `.`, `_`, `-`. So sánh sau khi chuẩn hoá
 * (bỏ khoảng trắng hai đầu, viết hoa) — xem normalizeMssv.
 */
export const MssvSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9._-]{1,32}$/, 'MSSV chỉ gồm chữ, số, dấu chấm, gạch dưới, gạch ngang (tối đa 32 ký tự)');

export function normalizeMssv(mssv: string): string {
  return mssv.trim().toUpperCase();
}

/** Mật khẩu: tối thiểu 8 ký tự (system-design mục 8); tối đa 128 để chặn băm chuỗi quá dài. */
export const PasswordSchema = z.string().min(8, 'Mật khẩu tối thiểu 8 ký tự').max(128);

/** Tên đăng nhập giảng viên. */
export const UsernameSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9._-]{3,64}$/, 'Tên đăng nhập 3–64 ký tự, chỉ gồm chữ không dấu, số, dấu chấm, gạch dưới, gạch ngang');

/** Tên thiết bị do app gửi khi đăng nhập, chỉ để hiển thị. */
export const DeviceNameSchema = z.string().trim().max(100);

/**
 * Mã kích hoạt: Crockford base32, hiển thị dạng `XXXX-XXXX-XXXX`.
 * Người dùng gõ có thể thiếu gạch, có khoảng trắng hay chữ thường; chuẩn hoá trước khi so sánh.
 */
export const ActivationCodeSchema = z.string().trim().min(1).max(64);

export function normalizeActivationCode(code: string): string {
  return code
    .toUpperCase()
    .replace(/[\s-]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1');
}
