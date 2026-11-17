import { z } from 'zod';

/** Phiên bản hợp đồng REST/WS/IPC. Tăng khi có thay đổi không tương thích. */
export const CONTRACT_VERSION = 1;

export const ROLES = ['lecturer', 'student'] as const;
export const RoleSchema = z.enum(ROLES);
export type Role = z.infer<typeof RoleSchema>;

/** Trạng thái bài tập (system-design mục 9). */
export const ASSIGNMENT_STATUSES = ['dang_tai_len', 'da_phat_hanh'] as const;
export const AssignmentStatusSchema = z.enum(ASSIGNMENT_STATUSES);
export type AssignmentStatus = z.infer<typeof AssignmentStatusSchema>;

/** Loại vé (system-design mục 6). */
export const TICKET_KINDS = ['gv_tai_len', 'phat_de', 'nop_bai', 'gv_thu_bai'] as const;
export const TicketKindSchema = z.enum(TICKET_KINDS);
export type TicketKind = z.infer<typeof TicketKindSchema>;

/**
 * Trạng thái vé. `huy` là đề xuất bổ sung so với system-design mục 9
 * (vé bị thay bằng vé mới, bài bị xoá, server khởi động lại) — chờ D review.
 */
export const TICKET_STATUSES = ['cho', 'dang_chay', 'xong', 'loi', 'het_han', 'huy'] as const;
export const TicketStatusSchema = z.enum(TICKET_STATUSES);
export type TicketStatus = z.infer<typeof TicketStatusSchema>;

export const TERMINAL_TICKET_STATUSES: readonly TicketStatus[] = ['xong', 'loi', 'het_han', 'huy'];
export function isTerminalTicketStatus(status: TicketStatus): boolean {
  return TERMINAL_TICKET_STATUSES.includes(status);
}

/** Lý do một lượt truyền thất bại / bị huỷ. Dùng chung cho vé, WS và IPC. */
export const TRANSFER_FAILURE_REASONS = [
  'timeout',
  'cancelled',
  'peer_disconnected',
  'relay_unreachable',
  'relay_auth_failed',
  'size_exceeded',
  'verify_failed',
  'disk_full',
  'superseded',
  'assignment_deleted',
  'server_restart',
  'source_rejected',
  'internal',
] as const;
export const TransferFailureReasonSchema = z.enum(TRANSFER_FAILURE_REASONS);
export type TransferFailureReason = z.infer<typeof TransferFailureReasonSchema>;

/** Nguồn sinh viên đã nhận đề (participants.received_from). */
export const RECEIVED_FROM = ['vps', 'peer', 'lecturer'] as const;
export const ReceivedFromSchema = z.enum(RECEIVED_FROM);
export type ReceivedFrom = z.infer<typeof ReceivedFromSchema>;

const MB = 1024 * 1024;

/** Giới hạn mặc định (system-design mục 13). Server cho phép ghi đè bằng cấu hình. */
export const LimitsSchema = z.object({
  maxStudentsPerAssignment: z.int().positive(),
  maxAssignmentBytes: z.int().positive(),
  maxSubmissionBytes: z.int().positive(),
  maxManifestFiles: z.int().positive(),
  vpsDistributionSlots: z.int().positive(),
  vpsTransferSlots: z.int().positive(),
  seederConcurrencyDefault: z.int().positive(),
  ticketMinSeconds: z.int().positive(),
  ticketMinBytesPerSecond: z.int().positive(),
  serveAcceptTimeoutSeconds: z.int().positive(),
});
export type Limits = z.infer<typeof LimitsSchema>;

export const DEFAULT_LIMITS: Limits = {
  maxStudentsPerAssignment: 100,
  maxAssignmentBytes: 1024 * MB,
  maxSubmissionBytes: 200 * MB,
  maxManifestFiles: 10_000,
  vpsDistributionSlots: 10,
  vpsTransferSlots: 10,
  seederConcurrencyDefault: 1,
  ticketMinSeconds: 120,
  ticketMinBytesPerSecond: 100 * 1024,
  serveAcceptTimeoutSeconds: 5,
};

/** Hạn vé = max(ticketMinSeconds, dung lượng / ticketMinBytesPerSecond) — system-design mục 7.4. */
export function ticketLifetimeMs(totalBytes: number, limits: Pick<Limits, 'ticketMinSeconds' | 'ticketMinBytesPerSecond'>): number {
  const byRate = Math.ceil((totalBytes / limits.ticketMinBytesPerSecond) * 1000);
  return Math.max(limits.ticketMinSeconds * 1000, byRate);
}
