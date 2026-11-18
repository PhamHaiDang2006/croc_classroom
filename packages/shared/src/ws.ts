import { z } from 'zod';
import { CidrSchema, IdSchema, TimestampSchema } from './common.js';
import { TicketKindSchema, TicketStatusSchema, TransferFailureReasonSchema } from './constants.js';
import { IssuedTicketSchema, ReceiptSchema } from './dto.js';

/**
 * Hợp đồng WebSocket v1 — `GET /ws` (đề xuất của bootstrap, D là bên quản lý, chờ D/B/C review).
 *
 * Kết nối:
 * - Xác thực bằng header `Authorization: Bearer <token>` khi nâng cấp kết nối (main process dùng thư
 *   viện `ws`, đặt được header). Subprotocol `croc-classroom.v1`.
 * - Mỗi thông điệp là một đối tượng JSON có trường `type`. Thông điệp không hợp lệ: server gửi
 *   `error` và giữ kết nối; quá nhiều lỗi liên tiếp thì đóng với mã WS_CLOSE.badMessage.
 * - Ngay sau khi mở: client gửi `hello`, rồi `seed.announce` cho mọi bài đang có trong cache.
 *
 * Nhịp tim và kết nối lại:
 * - Server gửi WS ping mỗi `heartbeatSeconds` (trong `welcome`); không nhận pong sau 2 nhịp thì đóng.
 * - Client không nhận được gì (kể cả ping) sau 3 nhịp thì tự đóng và kết nối lại.
 * - Kết nối lại với backoff 1s, 2s, 4s… tối đa 30s, có jitter. Sau khi kết nối lại: `hello`,
 *   `seed.announce`, rồi đồng bộ trạng thái các vé còn dang dở qua REST `GET /tickets/:id`.
 * - Server khởi động lại: mọi vé chưa kết thúc chuyển `huy` (lý do server_restart); trạng thái seeder
 *   (trong bộ nhớ) được dựng lại từ `hello`/`seed.announce`.
 *
 * Tương quan: các thông điệp về một lượt truyền mang `ticketId`. Không có id yêu cầu riêng.
 */

export const WS_PATH = '/ws';
export const WS_SUBPROTOCOL = 'croc-classroom.v1';

/** Mã đóng kết nối do ứng dụng định nghĩa (dải 4000–4999). */
export const WS_CLOSE = {
  /** Token sai hoặc hết hạn: đăng nhập lại, không tự kết nối lại. */
  unauthenticated: 4401,
  /** Tài khoản bị vô hiệu hoá / phiên bị thu hồi: không tự kết nối lại. */
  revoked: 4403,
  /** Quá nhiều thông điệp sai. */
  badMessage: 4400,
  /** Server đang tắt: kết nối lại theo backoff. */
  shuttingDown: 4503,
} as const;

// ---------------------------------------------------------------- client → server

export const HelloMessageSchema = z.object({
  type: z.literal('hello'),
  protocol: z.literal(1),
  localSubnets: z.array(CidrSchema).max(16),
  appVersion: z.string().max(50),
});

export const SeedAnnounceMessageSchema = z.object({
  type: z.literal('seed.announce'),
  assignmentIds: z.array(IdSchema).max(500),
});

export const SeedWithdrawMessageSchema = z.object({
  type: z.literal('seed.withdraw'),
  assignmentId: IdSchema,
});

export const ServeAcceptMessageSchema = z.object({
  type: z.literal('serve.accept'),
  ticketId: IdSchema,
});

export const ServeRejectMessageSchema = z.object({
  type: z.literal('serve.reject'),
  ticketId: IdSchema,
  reason: z.enum(['busy', 'sharing_disabled', 'not_in_cache']),
});

export const ServeResultMessageSchema = z.object({
  type: z.literal('serve.result'),
  ticketId: IdSchema,
  ok: z.boolean(),
  reason: TransferFailureReasonSchema.optional(),
});

export const ClientMessageSchema = z.discriminatedUnion('type', [
  HelloMessageSchema,
  SeedAnnounceMessageSchema,
  SeedWithdrawMessageSchema,
  ServeAcceptMessageSchema,
  ServeRejectMessageSchema,
  ServeResultMessageSchema,
]);
export type ClientMessage = z.infer<typeof ClientMessageSchema>;

// ---------------------------------------------------------------- server → client

export const WelcomeMessageSchema = z.object({
  type: z.literal('welcome'),
  userId: IdSchema,
  serverTime: TimestampSchema,
  heartbeatSeconds: z.int().positive(),
});

/** Yêu cầu seeder phát đề. Seeder trả `serve.accept`/`serve.reject` trong serveAcceptTimeoutSeconds. */
export const ServeRequestMessageSchema = z.object({
  type: z.literal('serve.request'),
  ticketId: IdSchema,
  assignmentId: IdSchema,
  crocCode: z.string().min(1),
  expiresAt: TimestampSchema,
});

/** Vé phat_de cho SV đang xếp hàng. */
export const TicketReadyMessageSchema = z.object({
  type: z.literal('ticket.ready'),
  ticket: IssuedTicketSchema,
});

/** Huỷ vé: hai bên dừng croc ngay. */
export const TicketCancelMessageSchema = z.object({
  type: z.literal('ticket.cancel'),
  ticketId: IdSchema,
  reason: TransferFailureReasonSchema,
});

/** Vé đổi trạng thái (gửi cho bên tham gia là người dùng). Có biên nhận khi vé nop_bai xong. */
export const TicketUpdatedMessageSchema = z.object({
  type: z.literal('ticket.updated'),
  ticketId: IdSchema,
  kind: TicketKindSchema,
  assignmentId: IdSchema,
  status: TicketStatusSchema,
  failureReason: TransferFailureReasonSchema.nullable(),
  receipt: ReceiptSchema.nullable(),
});

export const QueuePositionMessageSchema = z.object({
  type: z.literal('queue.position'),
  assignmentId: IdSchema,
  position: z.int().positive(),
});

/** Gửi GV: có bài nộp mới đã xác minh. */
export const SubmissionNewMessageSchema = z.object({
  type: z.literal('submission.new'),
  assignmentId: IdSchema,
  submissionId: IdSchema,
  version: z.int().positive(),
});

/** Gửi GV: bài đã phát hành (VPS xác minh xong đề). */
export const AssignmentPublishedMessageSchema = z.object({
  type: z.literal('assignment.published'),
  assignmentId: IdSchema,
});

/** Gửi mọi client liên quan: bài bị xoá — ngừng chia sẻ, xoá cache, huỷ lượt đang chạy. */
export const AssignmentDeletedMessageSchema = z.object({
  type: z.literal('assignment.deleted'),
  assignmentId: IdSchema,
});

/** Trả lời `seed.announce` cho những bài server không chấp nhận làm seeder. */
export const SeedRejectedMessageSchema = z.object({
  type: z.literal('seed.rejected'),
  assignmentId: IdSchema,
  reason: z.enum(['not_holder', 'banned', 'unknown_assignment']),
});

export const WsErrorMessageSchema = z.object({
  type: z.literal('error'),
  code: z.enum(['bad_message', 'not_allowed', 'unknown_ticket']),
  message: z.string(),
});

export const ServerMessageSchema = z.discriminatedUnion('type', [
  WelcomeMessageSchema,
  ServeRequestMessageSchema,
  TicketReadyMessageSchema,
  TicketCancelMessageSchema,
  TicketUpdatedMessageSchema,
  QueuePositionMessageSchema,
  SubmissionNewMessageSchema,
  AssignmentPublishedMessageSchema,
  AssignmentDeletedMessageSchema,
  SeedRejectedMessageSchema,
  WsErrorMessageSchema,
]);
export type ServerMessage = z.infer<typeof ServerMessageSchema>;

export type ClientMessageType = ClientMessage['type'];
export type ServerMessageType = ServerMessage['type'];
