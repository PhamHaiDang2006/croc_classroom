import { z } from 'zod';
import { CodePhraseInputSchema } from './code-phrase.js';
import {
  ActivationCodeSchema,
  CidrSchema,
  DeviceNameSchema,
  IdSchema,
  MssvSchema,
  PasswordSchema,
  TimestampSchema,
  UsernameSchema,
} from './common.js';
import {
  ActivationCodeIssuedSchema,
  ClientConfigSchema,
  CollectTicketSchema,
  HealthSchema,
  IssuedTicketSchema,
  LecturerAssignmentDetailSchema,
  LecturerAssignmentSchema,
  ReceiptSchema,
  SessionSchema,
  StudentAssignmentDetailSchema,
  StudentAssignmentSchema,
  StudentImportResultSchema,
  StudentSchema,
  SubmissionRowSchema,
  TicketInfoSchema,
  TicketResultReportSchema,
  UserSchema,
} from './dto.js';
import type { ApiErrorCode } from './errors.js';
import { ManifestSchema } from './manifest.js';

/**
 * Hợp đồng REST v1. Mỗi endpoint là một đối tượng định nghĩa: server dùng để đăng ký route và
 * kiểm tra đầu vào/đầu ra; client dùng để gọi và kiểm tra phản hồi. Không sao chép kiểu ở nơi khác.
 *
 * Quy ước chung:
 * - JSON UTF-8. Thời gian là chuỗi ISO UTC. ID là UUID.
 * - Xác thực: header `Authorization: Bearer <token>`.
 * - Lỗi: body ApiErrorBody, HTTP status theo ERROR_HTTP_STATUS. Ngoài `errors` liệt kê ở từng
 *   endpoint, mọi endpoint có thể trả VALIDATION_FAILED, RATE_LIMITED, INTERNAL; endpoint cần
 *   đăng nhập có thể trả UNAUTHENTICATED, ACCOUNT_DISABLED, FORBIDDEN.
 * - Tài nguyên không thuộc quyền người gọi trả NOT_FOUND (không tiết lộ sự tồn tại).
 */

export type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE';
/** `none`: không cần đăng nhập. `any`: GV hoặc SV. */
export type AuthRequirement = 'none' | 'any' | 'lecturer' | 'student';
export type SuccessStatus = 200 | 201 | 204;

type Schema = z.ZodType;
type MaybeSchema = Schema | undefined;

export interface Endpoint<
  A extends AuthRequirement = AuthRequirement,
  P extends MaybeSchema = MaybeSchema,
  Q extends MaybeSchema = MaybeSchema,
  B extends MaybeSchema = MaybeSchema,
  R extends MaybeSchema = MaybeSchema,
> {
  readonly method: HttpMethod;
  readonly path: string;
  readonly auth: A;
  readonly params: P;
  readonly query: Q;
  readonly body: B;
  /** undefined ⇒ thành công trả 204 không có body. */
  readonly response: R;
  readonly successStatus: SuccessStatus;
  readonly errors: readonly ApiErrorCode[];
  readonly summary: string;
}

export function defineEndpoint<
  A extends AuthRequirement,
  P extends MaybeSchema = undefined,
  Q extends MaybeSchema = undefined,
  B extends MaybeSchema = undefined,
  R extends MaybeSchema = undefined,
>(def: {
  method: HttpMethod;
  path: string;
  auth: A;
  summary: string;
  params?: P;
  query?: Q;
  body?: B;
  response?: R;
  successStatus?: SuccessStatus;
  errors?: readonly ApiErrorCode[];
}): Endpoint<A, P, Q, B, R> {
  return {
    method: def.method,
    path: def.path,
    auth: def.auth,
    summary: def.summary,
    params: def.params as P,
    query: def.query as Q,
    body: def.body as B,
    response: def.response as R,
    successStatus: def.successStatus ?? (def.response ? 200 : 204),
    errors: def.errors ?? [],
  };
}

type Out<S> = S extends Schema ? z.output<S> : undefined;
type In<S> = S extends Schema ? z.input<S> : undefined;

export type AnyEndpoint = Endpoint;
export type EndpointParams<E extends AnyEndpoint> = Out<E['params']>;
export type EndpointQuery<E extends AnyEndpoint> = Out<E['query']>;
/** Body client gửi (trước khi schema chuẩn hoá). */
export type EndpointRequestBody<E extends AnyEndpoint> = In<E['body']>;
/** Body server nhận (sau khi schema chuẩn hoá). */
export type EndpointBody<E extends AnyEndpoint> = Out<E['body']>;
export type EndpointResponse<E extends AnyEndpoint> = Out<E['response']>;

/** Thay `:tham_so` trong path bằng giá trị đã mã hoá URL. */
export function buildPath(path: string, params: Record<string, string> = {}): string {
  return path.replace(/:([A-Za-z]+)/g, (_match, name: string) => {
    const value = params[name];
    if (value === undefined) throw new Error(`Thiếu tham số đường dẫn "${name}" cho ${path}`);
    return encodeURIComponent(value);
  });
}

// ---------------------------------------------------------------- schema dùng riêng cho REST

const IdParams = z.object({ id: IdSchema });

const SessionRequestBase = { password: PasswordSchema, deviceName: DeviceNameSchema.optional() };

export const LoginRequestSchema = z.discriminatedUnion('role', [
  z.object({ role: z.literal('lecturer'), username: UsernameSchema, ...SessionRequestBase }),
  z.object({ role: z.literal('student'), mssv: MssvSchema, ...SessionRequestBase }),
]);
export type LoginRequest = z.input<typeof LoginRequestSchema>;

export const ActivateRequestSchema = z.object({
  mssv: MssvSchema,
  activationCode: ActivationCodeSchema,
  newPassword: PasswordSchema,
  deviceName: DeviceNameSchema.optional(),
});
export type ActivateRequest = z.input<typeof ActivateRequestSchema>;

export const TitleSchema = z.string().trim().min(1, 'Tiêu đề không được trống').max(200);
export const DescriptionSchema = z.string().max(5000);

export const CreateAssignmentRequestSchema = z.object({
  title: TitleSchema,
  description: DescriptionSchema.default(''),
  deadlineAt: TimestampSchema.nullable(),
  manifest: ManifestSchema,
});
export type CreateAssignmentRequest = z.input<typeof CreateAssignmentRequestSchema>;

export const UpdateAssignmentRequestSchema = z
  .object({
    title: TitleSchema.optional(),
    description: DescriptionSchema.optional(),
    deadlineAt: TimestampSchema.nullable().optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), 'Cần ít nhất một trường để sửa');
export type UpdateAssignmentRequest = z.input<typeof UpdateAssignmentRequestSchema>;

export const FetchRequestSchema = z.object({
  /** Subnet LAN của máy SV (system-design mục 7.4). Tối đa 16 mục. */
  localSubnets: z.array(CidrSchema).max(16),
});

export const FetchResponseSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('ticket'), ticket: IssuedTicketSchema }),
  /** Đang xếp hàng: vé đến sau qua WS `ticket.ready`. */
  z.object({ status: z.literal('queued'), position: z.int().positive() }),
]);
export type FetchResponse = z.infer<typeof FetchResponseSchema>;

// ---------------------------------------------------------------- danh sách endpoint

export const endpoints = {
  health: defineEndpoint({
    method: 'GET',
    path: '/health',
    auth: 'none',
    summary: 'Kiểm tra sức khoẻ cho Docker/Caddy.',
    response: HealthSchema,
  }),

  // ------------------------------------------------ tài khoản (C)
  activate: defineEndpoint({
    method: 'POST',
    path: '/auth/activate',
    auth: 'none',
    summary: 'SV kích hoạt bằng MSSV + mã kích hoạt + mật khẩu mới; trả phiên đăng nhập. Thu hồi mọi phiên cũ.',
    body: ActivateRequestSchema,
    response: SessionSchema,
    errors: ['ACTIVATION_INVALID', 'ACCOUNT_DISABLED'],
  }),
  login: defineEndpoint({
    method: 'POST',
    path: '/auth/login',
    auth: 'none',
    summary: 'Đăng nhập: GV bằng username, SV bằng MSSV.',
    body: LoginRequestSchema,
    response: SessionSchema,
    errors: ['INVALID_CREDENTIALS', 'ACCOUNT_DISABLED', 'ACCOUNT_NOT_ACTIVATED'],
  }),
  logout: defineEndpoint({
    method: 'POST',
    path: '/auth/logout',
    auth: 'any',
    summary: 'Thu hồi phiên hiện tại. Gọi lại khi đã đăng xuất vẫn trả 204.',
  }),
  me: defineEndpoint({
    method: 'GET',
    path: '/me',
    auth: 'any',
    summary: 'Người dùng hiện tại.',
    response: UserSchema,
  }),
  config: defineEndpoint({
    method: 'GET',
    path: '/config',
    auth: 'any',
    summary: 'Địa chỉ + mật khẩu relay, giới hạn, giờ server. Chỉ cho người đã đăng nhập.',
    response: ClientConfigSchema,
  }),
  importStudents: defineEndpoint({
    method: 'POST',
    path: '/students/import',
    auth: 'lecturer',
    summary:
      'Nhập CSV `mssv,ho_ten[,lop]` (UTF-8, dòng tiêu đề tuỳ chọn). Có lỗi định dạng thì không tạo gì; MSSV đã tồn tại thì bỏ qua và báo lại.',
    body: z.object({ csv: z.string().min(1).max(1_000_000) }),
    response: StudentImportResultSchema,
  }),
  listStudents: defineEndpoint({
    method: 'GET',
    path: '/students',
    auth: 'lecturer',
    summary: 'Danh sách SV và trạng thái kích hoạt.',
    response: z.object({ students: z.array(StudentSchema) }),
  }),
  updateStudent: defineEndpoint({
    method: 'PATCH',
    path: '/students/:id',
    auth: 'lecturer',
    summary: 'Vô hiệu hoá / mở lại tài khoản SV. Vô hiệu hoá thu hồi mọi phiên.',
    params: IdParams,
    body: z.object({ disabled: z.boolean() }),
    response: StudentSchema,
    errors: ['NOT_FOUND'],
  }),
  reissueActivationCode: defineEndpoint({
    method: 'POST',
    path: '/students/:id/activation-code',
    auth: 'lecturer',
    summary: 'Cấp lại mã kích hoạt (SV quên mật khẩu). Mã cũ hết hiệu lực; phiên cũ bị thu hồi khi SV kích hoạt lại.',
    params: IdParams,
    response: ActivationCodeIssuedSchema,
    successStatus: 201,
    errors: ['NOT_FOUND'],
  }),

  // ------------------------------------------------ bài tập (C)
  createAssignment: defineEndpoint({
    method: 'POST',
    path: '/assignments',
    auth: 'lecturer',
    summary: 'Tạo bài ở trạng thái dang_tai_len và mở vé gv_tai_len. Bài phát hành khi VPS xác minh xong (WS assignment.published).',
    body: CreateAssignmentRequestSchema,
    response: z.object({ assignment: LecturerAssignmentSchema, ticket: IssuedTicketSchema }),
    successStatus: 201,
    errors: ['MANIFEST_INVALID', 'PAYLOAD_TOO_LARGE', 'CAPACITY_EXHAUSTED'],
  }),
  renewUploadTicket: defineEndpoint({
    method: 'POST',
    path: '/assignments/:id/upload-ticket',
    auth: 'lecturer',
    summary: 'Tải đề lên bị lỗi: xin vé gv_tai_len mới (vé cũ chưa kết thúc bị huỷ).',
    params: IdParams,
    response: z.object({ ticket: IssuedTicketSchema }),
    successStatus: 201,
    errors: ['NOT_FOUND', 'ASSIGNMENT_ALREADY_PUBLISHED', 'CAPACITY_EXHAUSTED'],
  }),
  listAssignments: defineEndpoint({
    method: 'GET',
    path: '/assignments',
    auth: 'lecturer',
    summary: 'Danh sách bài kèm thống kê, mới nhất trước.',
    response: z.object({ assignments: z.array(LecturerAssignmentSchema) }),
  }),
  getAssignment: defineEndpoint({
    method: 'GET',
    path: '/assignments/:id',
    auth: 'lecturer',
    summary: 'Chi tiết bài + manifest + thống kê.',
    params: IdParams,
    response: LecturerAssignmentDetailSchema,
    errors: ['NOT_FOUND'],
  }),
  updateAssignment: defineEndpoint({
    method: 'PATCH',
    path: '/assignments/:id',
    auth: 'lecturer',
    summary: 'Sửa tiêu đề, mô tả, hạn nộp. Không sửa file. Đổi hạn không tính lại cờ trễ của bản nộp cũ.',
    params: IdParams,
    body: UpdateAssignmentRequestSchema,
    response: LecturerAssignmentSchema,
    errors: ['NOT_FOUND'],
  }),
  deleteAssignment: defineEndpoint({
    method: 'DELETE',
    path: '/assignments/:id',
    auth: 'lecturer',
    summary: 'Xoá bài, đề, mọi bài nộp; huỷ vé đang chạy; báo client qua WS assignment.deleted. Xoá lại bài đã xoá trả NOT_FOUND.',
    params: IdParams,
    errors: ['NOT_FOUND'],
  }),
  join: defineEndpoint({
    method: 'POST',
    path: '/join',
    auth: 'student',
    summary: 'Nhập code phrase. Chỉ bài đã phát hành. Gọi lại khi đã tham gia trả lại cùng thông tin.',
    body: z.object({ codePhrase: CodePhraseInputSchema }),
    response: StudentAssignmentDetailSchema,
    errors: ['CODE_PHRASE_INVALID', 'ASSIGNMENT_FULL'],
  }),
  myAssignments: defineEndpoint({
    method: 'GET',
    path: '/my/assignments',
    auth: 'student',
    summary: 'Các bài SV đã tham gia.',
    response: z.object({ assignments: z.array(StudentAssignmentSchema) }),
  }),
  myAssignment: defineEndpoint({
    method: 'GET',
    path: '/my/assignments/:id',
    auth: 'student',
    summary: 'Chi tiết một bài đã tham gia, kèm manifest (để xác minh lại cache sau khi khởi động).',
    params: IdParams,
    response: StudentAssignmentDetailSchema,
    errors: ['NOT_FOUND'],
  }),

  // ------------------------------------------------ phân phối đề (D)
  fetch: defineEndpoint({
    method: 'POST',
    path: '/assignments/:id/fetch',
    auth: 'student',
    summary:
      'Xin vé phat_de (chọn nguồn theo phương án A) hoặc vào hàng đợi. Gọi lại huỷ vé phat_de chưa kết thúc của chính SV cho bài này.',
    params: IdParams,
    body: FetchRequestSchema,
    response: FetchResponseSchema,
    errors: ['NOT_FOUND', 'NOT_PARTICIPANT'],
  }),
  leaveFetchQueue: defineEndpoint({
    method: 'DELETE',
    path: '/assignments/:id/fetch',
    auth: 'student',
    summary: 'Rời hàng đợi nhận đề (nếu đang xếp hàng). Không xếp hàng vẫn trả 204.',
    params: IdParams,
  }),

  // ------------------------------------------------ nộp bài (C)
  submit: defineEndpoint({
    method: 'POST',
    path: '/assignments/:id/submit',
    auth: 'student',
    summary:
      'Xin vé nop_bai. Gọi lại huỷ vé nop_bai chưa kết thúc của chính SV cho bài này. Biên nhận có khi VPS xác minh xong (WS ticket.updated hoặc GET /tickets/:id).',
    params: IdParams,
    body: z.object({ manifest: ManifestSchema }),
    response: z.object({ ticket: IssuedTicketSchema }),
    successStatus: 201,
    errors: ['NOT_FOUND', 'NOT_PARTICIPANT', 'MANIFEST_INVALID', 'PAYLOAD_TOO_LARGE', 'CAPACITY_EXHAUSTED'],
  }),
  myReceipt: defineEndpoint({
    method: 'GET',
    path: '/assignments/:id/receipt',
    auth: 'student',
    summary: 'Biên nhận bản nộp mới nhất của chính SV (dùng sau khi mất kết nối). Chưa nộp thì NOT_FOUND.',
    params: IdParams,
    response: ReceiptSchema,
    errors: ['NOT_FOUND'],
  }),
  listSubmissions: defineEndpoint({
    method: 'GET',
    path: '/assignments/:id/submissions',
    auth: 'lecturer',
    summary: 'Một dòng cho mỗi SV đã tham gia: trạng thái, số lần nộp, phiên bản mới nhất và đã tải về chưa.',
    params: IdParams,
    response: z.object({ rows: z.array(SubmissionRowSchema) }),
    errors: ['NOT_FOUND'],
  }),
  collect: defineEndpoint({
    method: 'POST',
    path: '/submissions/:id/collect',
    auth: 'lecturer',
    summary:
      'Mở vé gv_thu_bai cho đúng phiên bản :id. Phiên bản đã bị thay bằng bản mới hơn thì SUBMISSION_SUPERSEDED. Tải xong và xác minh thì báo POST /tickets/:id/result.',
    params: IdParams,
    response: CollectTicketSchema,
    successStatus: 201,
    errors: ['NOT_FOUND', 'SUBMISSION_SUPERSEDED', 'CAPACITY_EXHAUSTED'],
  }),

  // ------------------------------------------------ vé (D, C)
  ticketResult: defineEndpoint({
    method: 'POST',
    path: '/tickets/:id/result',
    auth: 'any',
    summary:
      'Bên tham gia báo kết quả. Bên nhận (phat_de, gv_thu_bai) báo succeeded chỉ sau khi xác minh theo manifest. Báo của bên gửi chỉ để tham khảo. Báo lặp cùng kết quả trả lại trạng thái hiện tại.',
    params: IdParams,
    body: TicketResultReportSchema,
    response: TicketInfoSchema,
    errors: ['NOT_FOUND', 'TICKET_STATE_INVALID'],
  }),
  getTicket: defineEndpoint({
    method: 'GET',
    path: '/tickets/:id',
    auth: 'any',
    summary: 'Trạng thái vé (để đồng bộ lại sau khi mất kết nối). Chỉ bên tham gia vé xem được.',
    params: IdParams,
    response: TicketInfoSchema,
    errors: ['NOT_FOUND'],
  }),
} as const satisfies Record<string, AnyEndpoint>;

export type Endpoints = typeof endpoints;
export type EndpointName = keyof Endpoints;
