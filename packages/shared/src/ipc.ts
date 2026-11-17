import { z } from 'zod';
import { CodePhraseInputSchema } from './code-phrase.js';
import { IdSchema, TimestampSchema } from './common.js';
import type {
  ActivationCodeIssued,
  LecturerAssignment,
  LecturerAssignmentDetail,
  Receipt,
  Student,
  StudentAssignment,
  StudentAssignmentDetail,
  StudentImportResult,
  SubmissionRow,
  User,
} from './dto.js';
import type { AppErrorCode } from './errors.js';
import {
  ActivateRequestSchema,
  DescriptionSchema,
  LoginRequestSchema,
  TitleSchema,
  UpdateAssignmentRequestSchema,
} from './rest.js';

/**
 * Hợp đồng IPC v1 giữa renderer (A) và main (B) — đề xuất của bootstrap, B quản lý, chờ A/B review.
 *
 * - Preload mở đúng một đối tượng `window.croc` có kiểu CrocApi: `invoke(channel, input)` và
 *   `on(event, listener)`. Không mở ipcRenderer, fs, child_process hay module Node nào.
 * - Main kiểm tra `input` bằng `ipcInputSchemas[channel]` trước khi xử lý; sai thì trả lỗi INVALID_INPUT.
 * - `invoke` không ném lỗi: luôn trả IpcResult. Token phiên, mật khẩu relay, code croc và đường dẫn
 *   tuyệt đối không bao giờ gửi sang renderer, trừ đường dẫn thư mục trong Settings để hiển thị.
 * - Renderer không gửi đường dẫn file: chọn file/thư mục qua `dialog.pickPayload`, main giữ đường dẫn
 *   và trả `selectionId`. Thư mục lưu trữ chọn qua `settings.chooseDirectory`.
 * - `on` trả về hàm huỷ đăng ký; renderer phải gọi khi component unmount.
 */

export interface IpcError {
  code: AppErrorCode;
  message: string;
}
export type IpcResult<T> = { ok: true; data: T } | { ok: false; error: IpcError };

// ---------------------------------------------------------------- kiểu dữ liệu riêng của app

export const AppSettingsSchema = z.object({
  serverUrl: z.url(),
  /** Thư mục làm bài của SV, mặc định `<Tài liệu>/croc-classroom/`. */
  workDir: z.string(),
  /** Thư mục GV lưu bài thu về. */
  collectDir: z.string(),
  seedingEnabled: z.boolean(),
  /** Số lượt chia sẻ cùng lúc, mặc định 1. */
  seedingConcurrency: z.int().min(1).max(4),
});
export type AppSettings = z.infer<typeof AppSettingsSchema>;

export interface SessionState {
  serverUrl: string;
  /** null khi chưa đăng nhập. */
  user: User | null;
}

export interface PayloadSelection {
  selectionId: string;
  /** Tên file hoặc thư mục người dùng chọn, để hiển thị. */
  label: string;
  fileCount: number;
  totalSize: number;
}

/** Trạng thái cục bộ trên máy SV, ghép với dữ liệu server. */
export interface StudentAssignmentView extends StudentAssignment {
  local: {
    /** Đã có bản làm bài trong thư mục làm bài. */
    hasWorkCopy: boolean;
    /** Đang có trong cache chia sẻ và đã announce. */
    seeding: boolean;
  };
}

export interface SubmissionRowView extends SubmissionRow {
  /** Phiên bản đang có trên máy GV; null nếu chưa tải. */
  localVersion: number | null;
}

// ---------------------------------------------------------------- invoke

const NoInput = z.undefined();
const AssignmentIdInput = z.object({ assignmentId: IdSchema });

export const ipcInputSchemas = {
  'session.get': NoInput,
  'session.login': z.object({ serverUrl: z.url(), credentials: LoginRequestSchema }),
  'session.activate': z.object({ serverUrl: z.url(), request: ActivateRequestSchema }),
  'session.logout': NoInput,

  'settings.get': NoInput,
  'settings.update': z.object({
    seedingEnabled: z.boolean().optional(),
    seedingConcurrency: z.int().min(1).max(4).optional(),
  }),
  'settings.chooseDirectory': z.object({ field: z.enum(['workDir', 'collectDir']) }),

  'dialog.pickPayload': z.object({ mode: z.enum(['files', 'directory']) }),
  'file.saveText': z.object({ suggestedName: z.string().min(1).max(200), content: z.string().max(5_000_000) }),
  'shell.openFolder': z.object({ target: z.enum(['work', 'collected']), assignmentId: IdSchema }),
  'cache.clear': z.object({ assignmentId: IdSchema.optional() }),
  'transfer.cancel': z.object({ operationId: z.string().min(1) }),

  'students.list': NoInput,
  'students.import': z.object({ csv: z.string().min(1).max(1_000_000) }),
  'students.setDisabled': z.object({ studentId: IdSchema, disabled: z.boolean() }),
  'students.reissueActivation': z.object({ studentId: IdSchema }),

  'assignments.list': NoInput,
  'assignments.get': AssignmentIdInput,
  'assignments.create': z.object({
    title: TitleSchema,
    description: DescriptionSchema,
    deadlineAt: TimestampSchema.nullable(),
    selectionId: z.string().min(1),
  }),
  'assignments.retryUpload': AssignmentIdInput,
  'assignments.update': z.object({ assignmentId: IdSchema, changes: UpdateAssignmentRequestSchema }),
  'assignments.delete': AssignmentIdInput,

  'submissions.list': AssignmentIdInput,
  'submissions.collectNow': z.object({ assignmentId: IdSchema.optional() }),

  'student.join': z.object({ codePhrase: CodePhraseInputSchema }),
  'student.listAssignments': NoInput,
  'student.getAssignment': AssignmentIdInput,
  'student.fetch': AssignmentIdInput,
  'student.submit': z.object({ assignmentId: IdSchema, selectionId: z.string().min(1) }),
  'student.getReceipt': AssignmentIdInput,
} as const satisfies Record<string, z.ZodType>;

/** Kiểu dữ liệu `invoke` trả về khi thành công, theo từng kênh. */
export interface IpcOutputs {
  'session.get': SessionState;
  'session.login': SessionState;
  'session.activate': SessionState;
  'session.logout': SessionState;

  'settings.get': AppSettings;
  'settings.update': AppSettings;
  /** null nếu người dùng huỷ hộp thoại. */
  'settings.chooseDirectory': AppSettings | null;

  /** null nếu người dùng huỷ hộp thoại. */
  'dialog.pickPayload': PayloadSelection | null;
  'file.saveText': { saved: boolean };
  'shell.openFolder': null;
  'cache.clear': null;
  'transfer.cancel': null;

  'students.list': Student[];
  'students.import': StudentImportResult;
  'students.setDisabled': Student;
  'students.reissueActivation': ActivationCodeIssued;

  'assignments.list': LecturerAssignment[];
  'assignments.get': LecturerAssignmentDetail;
  /** Tiến trình tải lên theo dõi qua sự kiện `transfer` với `operationId`. */
  'assignments.create': { assignment: LecturerAssignment; operationId: string };
  'assignments.retryUpload': { operationId: string };
  'assignments.update': LecturerAssignment;
  'assignments.delete': null;

  'submissions.list': SubmissionRowView[];
  'submissions.collectNow': null;

  'student.join': StudentAssignmentDetail;
  'student.listAssignments': StudentAssignmentView[];
  'student.getAssignment': StudentAssignmentDetail;
  'student.fetch': { operationId: string };
  'student.submit': { operationId: string };
  /** null nếu chưa nộp. */
  'student.getReceipt': Receipt | null;
}

export type IpcChannel = keyof typeof ipcInputSchemas;
export const IPC_CHANNELS = Object.keys(ipcInputSchemas) as IpcChannel[];
export type IpcInput<C extends IpcChannel> = z.input<(typeof ipcInputSchemas)[C]>;
export type IpcOutput<C extends IpcChannel> = IpcOutputs[C];

// Bảo đảm hai bảng kênh khớp nhau.
type _SameChannels = [IpcChannel] extends [keyof IpcOutputs]
  ? [keyof IpcOutputs] extends [IpcChannel]
    ? true
    : never
  : never;
const _channelsMatch: _SameChannels = true;
void _channelsMatch;

// ---------------------------------------------------------------- sự kiện main → renderer

export type TransferOperationKind = 'upload' | 'fetch' | 'submit' | 'collect' | 'seed';

export type TransferPhase =
  | 'preparing'
  | 'queued'
  | 'waiting_source'
  | 'transferring'
  | 'verifying'
  | 'succeeded'
  | 'failed'
  | 'cancelled'
  | 'timeout';

export interface TransferEvent {
  operationId: string;
  kind: TransferOperationKind;
  assignmentId: string;
  phase: TransferPhase;
  bytesDone: number;
  bytesTotal: number;
  /** Có khi phase = queued. */
  queuePosition?: number;
  /** Có khi phase = failed/timeout/cancelled. */
  error?: IpcError;
  /** Có khi kind = submit và phase = succeeded. Chỉ báo "đã nộp" khi có biên nhận. */
  receipt?: Receipt;
  at: string;
}

export interface IpcEvents {
  transfer: TransferEvent;
  connection: { server: 'connecting' | 'online' | 'offline' };
  assignment: { assignmentId: string; change: 'published' | 'updated' | 'deleted' | 'submission_new' };
  session: { reason: 'logged_out' | 'revoked' | 'expired' };
}
export type IpcEventName = keyof IpcEvents;
export const IPC_EVENTS: readonly IpcEventName[] = ['transfer', 'connection', 'assignment', 'session'];

/** Tên kênh Electron thực tế (preload/main dùng). */
export const ipcChannelName = (channel: IpcChannel): string => `croc:invoke:${channel}`;
export const ipcEventName = (event: IpcEventName): string => `croc:event:${event}`;

type InvokeArgs<C extends IpcChannel> = undefined extends IpcInput<C> ? [input?: IpcInput<C>] : [input: IpcInput<C>];

/** API preload mở ra tại `window.croc`. */
export interface CrocApi {
  invoke<C extends IpcChannel>(channel: C, ...args: InvokeArgs<C>): Promise<IpcResult<IpcOutput<C>>>;
  on<E extends IpcEventName>(event: E, listener: (payload: IpcEvents[E]) => void): () => void;
}
