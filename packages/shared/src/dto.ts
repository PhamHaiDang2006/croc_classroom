import { z } from 'zod';
import { CodePhraseSchema } from './code-phrase.js';
import { IdSchema, MssvSchema, TimestampSchema, UsernameSchema } from './common.js';
import {
  AssignmentStatusSchema,
  LimitsSchema,
  TicketKindSchema,
  TicketStatusSchema,
  TransferFailureReasonSchema,
} from './constants.js';
import { ManifestSchema, Sha256HexSchema } from './manifest.js';

// ---------------------------------------------------------------- người dùng

export const LecturerUserSchema = z.object({
  id: IdSchema,
  role: z.literal('lecturer'),
  username: UsernameSchema,
  fullName: z.string(),
});

export const StudentUserSchema = z.object({
  id: IdSchema,
  role: z.literal('student'),
  mssv: MssvSchema,
  fullName: z.string(),
  classLabel: z.string().nullable(),
});

/** Người đang đăng nhập (GET /me). */
export const UserSchema = z.discriminatedUnion('role', [LecturerUserSchema, StudentUserSchema]);
export type User = z.infer<typeof UserSchema>;

/** Sinh viên như giảng viên thấy trong màn hình quản lý. */
export const StudentSchema = z.object({
  id: IdSchema,
  mssv: MssvSchema,
  fullName: z.string(),
  classLabel: z.string().nullable(),
  activated: z.boolean(),
  disabled: z.boolean(),
  /** Hạn mã kích hoạt đang chờ dùng; null nếu không có mã nào đang hiệu lực. */
  activationExpiresAt: TimestampSchema.nullable(),
  createdAt: TimestampSchema,
});
export type Student = z.infer<typeof StudentSchema>;

/** Thông tin rút gọn của sinh viên trong các danh sách khác. */
export const StudentRefSchema = StudentSchema.pick({ id: true, mssv: true, fullName: true, classLabel: true });
export type StudentRef = z.infer<typeof StudentRefSchema>;

export const SessionSchema = z.object({
  /** Token phiên mờ. Chỉ main process giữ; không gửi sang renderer. */
  token: z.string().min(32).max(256),
  expiresAt: TimestampSchema,
  user: UserSchema,
});
export type Session = z.infer<typeof SessionSchema>;

export const ActivationCodeIssuedSchema = z.object({
  studentId: IdSchema,
  mssv: MssvSchema,
  /** Mã chỉ trả về đúng một lần; server chỉ lưu bản băm. */
  activationCode: z.string(),
  activationExpiresAt: TimestampSchema,
});
export type ActivationCodeIssued = z.infer<typeof ActivationCodeIssuedSchema>;

export const StudentImportResultSchema = z.object({
  /** false khi có lỗi định dạng: không tạo tài khoản nào, xem `errors`. */
  imported: z.boolean(),
  created: z.array(z.object({ student: StudentSchema, activation: ActivationCodeIssuedSchema })),
  skipped: z.array(
    z.object({
      line: z.int().positive(),
      mssv: z.string(),
      reason: z.enum(['already_exists', 'duplicate_in_file']),
    }),
  ),
  errors: z.array(z.object({ line: z.int().positive(), message: z.string() })),
});
export type StudentImportResult = z.infer<typeof StudentImportResultSchema>;

// ---------------------------------------------------------------- cấu hình

export const ClientConfigSchema = z.object({
  relay: z.object({
    /** `host:port` của croc relay, ví dụ `relay.example.com:9009`. */
    address: z.string().min(1),
    password: z.string().min(1),
  }),
  limits: LimitsSchema,
  serverTime: TimestampSchema,
});
export type ClientConfig = z.infer<typeof ClientConfigSchema>;

export const HealthSchema = z.object({
  status: z.literal('ok'),
  contractVersion: z.int(),
  serverTime: TimestampSchema,
});
export type Health = z.infer<typeof HealthSchema>;

// ---------------------------------------------------------------- bài tập

export const AssignmentStatsSchema = z.object({
  /** SV đã nhập code. */
  participants: z.int().nonnegative(),
  /** SV đã nhận và xác minh đề. */
  received: z.int().nonnegative(),
  /** Máy đang online và chia sẻ đề (kể cả GV). Do distribution (D) cung cấp. */
  seeding: z.int().nonnegative(),
  /** SV có ít nhất một bản nộp đã xác minh (gồm cả nộp trễ). */
  submitted: z.int().nonnegative(),
  /** Trong số `submitted`: SV có bản nộp MỚI NHẤT bị trễ hạn. */
  late: z.int().nonnegative(),
  /** = participants − submitted (system-design mục 7.6: tính trên SV đã nhập code). */
  notSubmitted: z.int().nonnegative(),
});
export type AssignmentStats = z.infer<typeof AssignmentStatsSchema>;

const AssignmentBaseShape = {
  id: IdSchema,
  title: z.string(),
  description: z.string(),
  deadlineAt: TimestampSchema.nullable(),
  totalSize: z.int().nonnegative(),
  fileCount: z.int().positive(),
};

/** Bài tập như giảng viên thấy. */
export const LecturerAssignmentSchema = z.object({
  ...AssignmentBaseShape,
  /** Có ngay khi tạo, nhưng chỉ dùng được (POST /join) sau khi `status = da_phat_hanh`. */
  codePhrase: CodePhraseSchema,
  status: AssignmentStatusSchema,
  createdAt: TimestampSchema,
  publishedAt: TimestampSchema.nullable(),
  stats: AssignmentStatsSchema,
});
export type LecturerAssignment = z.infer<typeof LecturerAssignmentSchema>;

export const LecturerAssignmentDetailSchema = LecturerAssignmentSchema.extend({ manifest: ManifestSchema });
export type LecturerAssignmentDetail = z.infer<typeof LecturerAssignmentDetailSchema>;

/** Biên nhận nộp bài (system-design mục 7.5). */
export const ReceiptSchema = z.object({
  submissionId: IdSchema,
  assignmentId: IdSchema,
  /** Tăng dần từ 1 theo từng (bài, SV); chỉ tăng khi bản nộp đã xác minh xong trên VPS. */
  version: z.int().positive(),
  /** Giờ VPS xác minh xong (UTC). */
  receivedAt: TimestampSchema,
  isLate: z.boolean(),
  totalSize: z.int().nonnegative(),
  fileCount: z.int().positive(),
  /** Mã băm tổng của manifest bài nộp (hex). */
  manifestHash: Sha256HexSchema,
});
export type Receipt = z.infer<typeof ReceiptSchema>;

/** Bài tập như sinh viên thấy (chỉ bài đã tham gia). */
export const StudentAssignmentSchema = z.object({
  ...AssignmentBaseShape,
  joinedAt: TimestampSchema,
  /** Lúc server ghi nhận SV đã nhận và xác minh đề; null nếu chưa. */
  receivedAt: TimestampSchema.nullable(),
  latestReceipt: ReceiptSchema.nullable(),
});
export type StudentAssignment = z.infer<typeof StudentAssignmentSchema>;

export const StudentAssignmentDetailSchema = StudentAssignmentSchema.extend({ manifest: ManifestSchema });
export type StudentAssignmentDetail = z.infer<typeof StudentAssignmentDetailSchema>;

// ---------------------------------------------------------------- vé

/** Vé giao cho một bên tham gia lượt truyền. Chứa code croc bí mật: không ghi log, không lưu CSDL. */
export const IssuedTicketSchema = z.object({
  ticketId: IdSchema,
  kind: TicketKindSchema,
  assignmentId: IdSchema,
  crocCode: z.string().min(1),
  expiresAt: TimestampSchema,
  /** Tổng dung lượng dự kiến của lượt truyền (byte). */
  totalBytes: z.int().nonnegative(),
});
export type IssuedTicket = z.infer<typeof IssuedTicketSchema>;

/** Trạng thái vé (không chứa code croc). */
export const TicketInfoSchema = z.object({
  ticketId: IdSchema,
  kind: TicketKindSchema,
  assignmentId: IdSchema,
  status: TicketStatusSchema,
  createdAt: TimestampSchema,
  expiresAt: TimestampSchema,
  finishedAt: TimestampSchema.nullable(),
  failureReason: TransferFailureReasonSchema.nullable(),
  /** Chỉ có với vé `nop_bai` ở trạng thái `xong`, và chỉ trả cho chính SV đó. */
  receipt: ReceiptSchema.nullable(),
});
export type TicketInfo = z.infer<typeof TicketInfoSchema>;

/** Kết quả một lượt truyền do client báo (POST /tickets/:id/result). */
export const TicketResultReportSchema = z.discriminatedUnion('outcome', [
  z.object({ outcome: z.literal('succeeded') }),
  z.object({
    outcome: z.literal('failed'),
    reason: TransferFailureReasonSchema,
    message: z.string().max(500).optional(),
  }),
]);
export type TicketResultReport = z.infer<typeof TicketResultReportSchema>;

// ---------------------------------------------------------------- bài nộp (GV)

export const SubmissionStateSchema = z.enum(['chua_nop', 'da_nop', 'nop_tre']);
export type SubmissionState = z.infer<typeof SubmissionStateSchema>;

export const SubmissionVersionSchema = z.object({
  submissionId: IdSchema,
  version: z.int().positive(),
  receivedAt: TimestampSchema,
  isLate: z.boolean(),
  totalSize: z.int().nonnegative(),
  fileCount: z.int().positive(),
  manifestHash: Sha256HexSchema,
  /** Lúc GV đã tải về và xác minh đúng phiên bản này; null nếu chưa. */
  collectedAt: TimestampSchema.nullable(),
});
export type SubmissionVersion = z.infer<typeof SubmissionVersionSchema>;

export const SubmissionRowSchema = z.object({
  student: StudentRefSchema,
  state: SubmissionStateSchema,
  submitCount: z.int().nonnegative(),
  latest: SubmissionVersionSchema.nullable(),
});
export type SubmissionRow = z.infer<typeof SubmissionRowSchema>;

export const CollectTicketSchema = z.object({
  ticket: IssuedTicketSchema,
  submission: z.object({
    submissionId: IdSchema,
    assignmentId: IdSchema,
    student: StudentRefSchema,
    version: z.int().positive(),
    manifest: ManifestSchema,
    manifestHash: Sha256HexSchema,
  }),
});
export type CollectTicket = z.infer<typeof CollectTicketSchema>;
