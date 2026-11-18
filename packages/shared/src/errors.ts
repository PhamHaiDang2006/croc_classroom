import { z } from 'zod';

/**
 * Mã lỗi REST. Mọi phản hồi lỗi có dạng ApiErrorBody; HTTP status lấy từ ERROR_HTTP_STATUS.
 * Không thêm mã lỗi riêng trong từng module — đề xuất qua docs/handoffs.
 */
export const API_ERROR_CODES = [
  // chung
  'VALIDATION_FAILED',
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'RATE_LIMITED',
  'PAYLOAD_TOO_LARGE',
  'INTERNAL',
  // tài khoản
  'INVALID_CREDENTIALS',
  'ACCOUNT_DISABLED',
  'ACCOUNT_NOT_ACTIVATED',
  'ACTIVATION_INVALID',
  // bài tập
  'CODE_PHRASE_INVALID',
  'ASSIGNMENT_FULL',
  'ASSIGNMENT_ALREADY_PUBLISHED',
  'NOT_PARTICIPANT',
  'MANIFEST_INVALID',
  // vé và truyền file
  'CAPACITY_EXHAUSTED',
  'TICKET_STATE_INVALID',
  'SUBMISSION_SUPERSEDED',
] as const;

export const ApiErrorCodeSchema = z.enum(API_ERROR_CODES);
export type ApiErrorCode = z.infer<typeof ApiErrorCodeSchema>;

export const ERROR_HTTP_STATUS: Record<ApiErrorCode, number> = {
  VALIDATION_FAILED: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  PAYLOAD_TOO_LARGE: 413,
  INTERNAL: 500,
  INVALID_CREDENTIALS: 401,
  ACCOUNT_DISABLED: 403,
  ACCOUNT_NOT_ACTIVATED: 403,
  ACTIVATION_INVALID: 400,
  CODE_PHRASE_INVALID: 404,
  ASSIGNMENT_FULL: 409,
  ASSIGNMENT_ALREADY_PUBLISHED: 409,
  NOT_PARTICIPANT: 403,
  MANIFEST_INVALID: 422,
  CAPACITY_EXHAUSTED: 503,
  TICKET_STATE_INVALID: 409,
  SUBMISSION_SUPERSEDED: 409,
};

/** Chi tiết lỗi kiểm tra dữ liệu: một mục cho mỗi trường sai. */
export const ValidationIssueSchema = z.object({
  path: z.string(),
  message: z.string(),
});
export type ValidationIssue = z.infer<typeof ValidationIssueSchema>;

export const ApiErrorBodySchema = z.object({
  error: z.object({
    code: ApiErrorCodeSchema,
    message: z.string(),
    /** VALIDATION_FAILED / MANIFEST_INVALID: ValidationIssue[]. RATE_LIMITED, CAPACITY_EXHAUSTED: { retryAfterSeconds }. */
    details: z.unknown().optional(),
  }),
});
export type ApiErrorBody = z.infer<typeof ApiErrorBodySchema>;

/** Lỗi chỉ phát sinh phía app (main → renderer), không đến từ server. */
export const CLIENT_ERROR_CODES = [
  'OFFLINE',
  'NOT_LOGGED_IN',
  'INVALID_INPUT',
  'SELECTION_EXPIRED',
  'BUSY',
  'FS_ERROR',
  'CANCELLED',
] as const;

export const AppErrorCodeSchema = z.enum([...API_ERROR_CODES, ...CLIENT_ERROR_CODES]);
export type AppErrorCode = z.infer<typeof AppErrorCodeSchema>;

/** Chuyển lỗi zod thành danh sách ValidationIssue (dùng chung server và main). */
export function toValidationIssues(error: z.ZodError): ValidationIssue[] {
  return error.issues.map((issue) => ({
    path: issue.path.map(String).join('.'),
    message: issue.message,
  }));
}
