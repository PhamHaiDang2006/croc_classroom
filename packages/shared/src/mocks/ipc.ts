/**
 * Mock `window.croc` chạy hoàn toàn trong bộ nhớ, không cần Electron, server hay croc.
 * Để A làm giao diện trước khi B xong main/preload. Chạy được trong trình duyệt (không dùng Node.js).
 *
 * Đây là MOCK: không chứng minh luồng thật hoạt động. Hành vi bám theo hợp đồng IPC v1 và fixture.
 */
import type { AppErrorCode } from '../errors.js';
import {
  ipcInputSchemas,
  type AppSettings,
  type CrocApi,
  type IpcChannel,
  type IpcEventName,
  type IpcEvents,
  type IpcInput,
  type IpcOutput,
  type IpcResult,
  type PayloadSelection,
  type SessionState,
  type StudentAssignmentView,
  type TransferEvent,
  type TransferOperationKind,
} from '../ipc.js';
import type { LecturerAssignment, Receipt, Student, StudentAssignmentDetail, User } from '../dto.js';
import {
  fixtureCredentials,
  fixtureImportResult,
  fixtureLecturerAssignment,
  fixtureLecturerAssignmentUploading,
  fixtureLecturerUser,
  fixtureManifest,
  fixtureReceipt,
  fixtureStudentAssignmentDetail,
  fixtureStudents,
  fixtureStudentUser,
  fixtureSubmissionRows,
} from '../fixtures/index.js';

export interface MockCrocApiOptions {
  /** Đăng nhập sẵn với vai trò này; bỏ trống = chưa đăng nhập. */
  loggedInAs?: 'lecturer' | 'student';
  /** Độ trễ mỗi lệnh invoke (ms). Mặc định 150. */
  latencyMs?: number;
  /** Khoảng cách giữa các sự kiện tiến trình truyền (ms). Mặc định 400. */
  transferStepMs?: number;
  /** Kết quả các lượt truyền giả lập. Mặc định succeeded. */
  transferOutcome?: 'succeeded' | 'failed' | 'timeout';
  /** Ép một kênh luôn trả lỗi, để thử giao diện báo lỗi. */
  failures?: Partial<Record<IpcChannel, AppErrorCode>>;
}

export interface MockCrocApi extends CrocApi {
  /** Phát một sự kiện bất kỳ (ví dụ mất kết nối) để thử giao diện. */
  emit<E extends IpcEventName>(event: E, payload: IpcEvents[E]): void;
  /** Số listener đang đăng ký — dùng trong test để phát hiện quên huỷ đăng ký. */
  listenerCount(event?: IpcEventName): number;
}

const clone = <T>(value: T): T => structuredClone(value);

export function createMockCrocApi(options: MockCrocApiOptions = {}): MockCrocApi {
  const latencyMs = options.latencyMs ?? 150;
  const stepMs = options.transferStepMs ?? 400;
  const outcome = options.transferOutcome ?? 'succeeded';

  let user: User | null =
    options.loggedInAs === 'lecturer' ? fixtureLecturerUser : options.loggedInAs === 'student' ? fixtureStudentUser : null;
  let settings: AppSettings = {
    serverUrl: 'https://croc-classroom.example.test',
    workDir: '/home/sv/Documents/croc-classroom',
    collectDir: '/home/gv/Bai-nop',
    seedingEnabled: true,
    seedingConcurrency: 1,
  };
  const students: Student[] = clone(fixtureStudents);
  const assignments: LecturerAssignment[] = [clone(fixtureLecturerAssignment), clone(fixtureLecturerAssignmentUploading)];
  const joined = new Map<string, StudentAssignmentDetail>();
  const receipts = new Map<string, Receipt>();
  const selections = new Map<string, PayloadSelection>();
  const listeners = new Map<IpcEventName, Set<(payload: never) => void>>();
  let counter = 0;
  const nextId = (prefix: string) => `${prefix}-${++counter}`;

  const emit = <E extends IpcEventName>(event: E, payload: IpcEvents[E]) => {
    for (const listener of listeners.get(event) ?? []) (listener as (p: IpcEvents[E]) => void)(payload);
  };

  const session = (): SessionState => ({ serverUrl: settings.serverUrl, user });
  const ok = <T>(data: T): IpcResult<T> => ({ ok: true, data: clone(data) });
  const fail = (code: AppErrorCode, message: string): IpcResult<never> => ({ ok: false, error: { code, message } });

  function simulateTransfer(kind: TransferOperationKind, assignmentId: string, bytesTotal: number, onSuccess?: () => Partial<TransferEvent>): string {
    const operationId = nextId('op');
    const base = { operationId, kind, assignmentId, bytesTotal };
    const at = () => new Date().toISOString();
    const steps: Omit<TransferEvent, 'operationId' | 'kind' | 'assignmentId' | 'bytesTotal' | 'at'>[] = [
      { phase: 'preparing', bytesDone: 0 },
      { phase: 'transferring', bytesDone: Math.floor(bytesTotal / 2) },
      { phase: 'transferring', bytesDone: bytesTotal },
      { phase: 'verifying', bytesDone: bytesTotal },
    ];
    steps.forEach((step, i) => setTimeout(() => emit('transfer', { ...base, ...step, at: at() }), stepMs * (i + 1)));
    setTimeout(() => {
      if (outcome === 'succeeded') {
        emit('transfer', { ...base, phase: 'succeeded', bytesDone: bytesTotal, at: at(), ...onSuccess?.() });
      } else {
        emit('transfer', {
          ...base,
          phase: outcome,
          bytesDone: Math.floor(bytesTotal / 2),
          error: outcome === 'timeout' ? { code: 'CANCELLED', message: 'Hết thời gian truyền' } : { code: 'FS_ERROR', message: 'Lỗi giả lập' },
          at: at(),
        });
      }
    }, stepMs * (steps.length + 1));
    return operationId;
  }

  const requireRole = (role: User['role']): IpcResult<never> | null => {
    if (!user) return fail('NOT_LOGGED_IN', 'Chưa đăng nhập');
    if (user.role !== role) return fail('FORBIDDEN', 'Không có quyền');
    return null;
  };

  async function handle<C extends IpcChannel>(channel: C, input: IpcInput<C>): Promise<IpcResult<unknown>> {
    const parsed = ipcInputSchemas[channel].safeParse(input);
    if (!parsed.success) return fail('INVALID_INPUT', parsed.error.issues.map((i) => i.message).join('; '));
    const forced = options.failures?.[channel];
    if (forced) return fail(forced, `Lỗi giả lập cho ${channel}`);
    // Dữ liệu đã qua schema; ép kiểu theo từng nhánh bên dưới.
    const data = parsed.data as never as Record<string, unknown>;

    switch (channel) {
      case 'session.get':
        return ok(session());
      case 'session.login': {
        const { serverUrl, credentials } = data as unknown as IpcInput<'session.login'>;
        settings = { ...settings, serverUrl };
        if (credentials.role === 'lecturer' && credentials.username === fixtureCredentials.lecturer.username && credentials.password === fixtureCredentials.lecturer.password) {
          user = fixtureLecturerUser;
        } else if (credentials.role === 'student' && credentials.mssv === fixtureCredentials.student.mssv && credentials.password === fixtureCredentials.student.password) {
          user = fixtureStudentUser;
        } else {
          return fail('INVALID_CREDENTIALS', 'Sai tài khoản hoặc mật khẩu');
        }
        emit('connection', { server: 'online' });
        return ok(session());
      }
      case 'session.activate': {
        const { request } = data as unknown as IpcInput<'session.activate'>;
        if (request.activationCode.replace(/[\s-]/g, '').toUpperCase() !== fixtureCredentials.activationCode.replace(/-/g, '')) {
          return fail('ACTIVATION_INVALID', 'Mã kích hoạt không đúng hoặc đã hết hạn');
        }
        user = { ...fixtureStudentUser, mssv: request.mssv } as User;
        return ok(session());
      }
      case 'session.logout':
        user = null;
        emit('session', { reason: 'logged_out' });
        return ok(session());

      case 'settings.get':
        return ok(settings);
      case 'settings.update':
        settings = { ...settings, ...(data as Partial<AppSettings>) };
        return ok(settings);
      case 'settings.chooseDirectory': {
        const field = (data as { field: 'workDir' | 'collectDir' }).field;
        settings = { ...settings, [field]: `${settings[field]}-moi` };
        return ok(settings);
      }

      case 'dialog.pickPayload': {
        const mode = (data as { mode: 'files' | 'directory' }).mode;
        const selection: PayloadSelection = {
          selectionId: nextId('sel'),
          label: mode === 'directory' ? 'bai-lam' : 'Đề bài.pdf',
          fileCount: mode === 'directory' ? 3 : 1,
          totalSize: mode === 'directory' ? 2_400_000 : 512_000,
        };
        selections.set(selection.selectionId, selection);
        return ok(selection);
      }
      case 'file.saveText':
        return ok({ saved: true });
      case 'shell.openFolder':
      case 'cache.clear':
      case 'transfer.cancel':
        return ok(null);

      case 'students.list':
        return requireRole('lecturer') ?? ok(students);
      case 'students.import':
        return requireRole('lecturer') ?? ok(fixtureImportResult);
      case 'students.setDisabled': {
        const denied = requireRole('lecturer');
        if (denied) return denied;
        const { studentId, disabled } = data as { studentId: string; disabled: boolean };
        const student = students.find((s) => s.id === studentId);
        if (!student) return fail('NOT_FOUND', 'Không tìm thấy sinh viên');
        student.disabled = disabled;
        return ok(student);
      }
      case 'students.reissueActivation': {
        const denied = requireRole('lecturer');
        if (denied) return denied;
        const student = students.find((s) => s.id === (data as { studentId: string }).studentId);
        if (!student) return fail('NOT_FOUND', 'Không tìm thấy sinh viên');
        return ok({ studentId: student.id, mssv: student.mssv, activationCode: fixtureCredentials.activationCode, activationExpiresAt: '2026-12-01T08:00:00.000Z' });
      }

      case 'assignments.list':
        return requireRole('lecturer') ?? ok(assignments);
      case 'assignments.get': {
        const denied = requireRole('lecturer');
        if (denied) return denied;
        const found = assignments.find((a) => a.id === (data as { assignmentId: string }).assignmentId);
        return found ? ok({ ...found, manifest: fixtureManifest }) : fail('NOT_FOUND', 'Không tìm thấy bài');
      }
      case 'assignments.create': {
        const denied = requireRole('lecturer');
        if (denied) return denied;
        const input = data as unknown as IpcInput<'assignments.create'>;
        const selection = selections.get(input.selectionId);
        if (!selection) return fail('SELECTION_EXPIRED', 'Lựa chọn file đã hết hạn, hãy chọn lại');
        const assignment: LecturerAssignment = {
          ...clone(fixtureLecturerAssignmentUploading),
          id: `00000000-0000-4000-8000-${String(900000000000 + ++counter)}`,
          title: input.title,
          description: input.description,
          deadlineAt: input.deadlineAt,
          totalSize: selection.totalSize,
          fileCount: selection.fileCount,
          createdAt: new Date().toISOString(),
        };
        assignments.unshift(assignment);
        const operationId = simulateTransfer('upload', assignment.id, selection.totalSize, () => {
          assignment.status = 'da_phat_hanh';
          assignment.publishedAt = new Date().toISOString();
          setTimeout(() => emit('assignment', { assignmentId: assignment.id, change: 'published' }), 0);
          return {};
        });
        return ok({ assignment, operationId });
      }
      case 'assignments.retryUpload': {
        const denied = requireRole('lecturer');
        if (denied) return denied;
        const found = assignments.find((a) => a.id === (data as { assignmentId: string }).assignmentId);
        if (!found) return fail('NOT_FOUND', 'Không tìm thấy bài');
        if (found.status === 'da_phat_hanh') return fail('ASSIGNMENT_ALREADY_PUBLISHED', 'Bài đã phát hành');
        return ok({ operationId: simulateTransfer('upload', found.id, found.totalSize) });
      }
      case 'assignments.update': {
        const denied = requireRole('lecturer');
        if (denied) return denied;
        const { assignmentId, changes } = data as unknown as IpcInput<'assignments.update'>;
        const found = assignments.find((a) => a.id === assignmentId);
        if (!found) return fail('NOT_FOUND', 'Không tìm thấy bài');
        Object.assign(found, Object.fromEntries(Object.entries(changes).filter(([, v]) => v !== undefined)));
        return ok(found);
      }
      case 'assignments.delete': {
        const denied = requireRole('lecturer');
        if (denied) return denied;
        const id = (data as { assignmentId: string }).assignmentId;
        const index = assignments.findIndex((a) => a.id === id);
        if (index < 0) return fail('NOT_FOUND', 'Không tìm thấy bài');
        assignments.splice(index, 1);
        emit('assignment', { assignmentId: id, change: 'deleted' });
        return ok(null);
      }

      case 'submissions.list':
        return requireRole('lecturer') ?? ok(fixtureSubmissionRows.map((row) => ({ ...row, localVersion: null })));
      case 'submissions.collectNow':
        return requireRole('lecturer') ?? ok(null);

      case 'student.join': {
        const denied = requireRole('student');
        if (denied) return denied;
        if ((data as { codePhrase: string }).codePhrase !== fixtureCredentials.codePhrase) {
          return fail('CODE_PHRASE_INVALID', 'Code không đúng');
        }
        const detail = { ...clone(fixtureStudentAssignmentDetail), receivedAt: null, latestReceipt: null, joinedAt: new Date().toISOString() };
        if (!joined.has(detail.id)) joined.set(detail.id, detail);
        return ok(joined.get(detail.id)!);
      }
      case 'student.listAssignments': {
        const denied = requireRole('student');
        if (denied) return denied;
        const views: StudentAssignmentView[] = [...joined.values()].map(({ manifest: _m, ...rest }) => ({
          ...rest,
          latestReceipt: receipts.get(rest.id) ?? null,
          local: { hasWorkCopy: rest.receivedAt !== null, seeding: rest.receivedAt !== null && settings.seedingEnabled },
        }));
        return ok(views);
      }
      case 'student.getAssignment': {
        const denied = requireRole('student');
        if (denied) return denied;
        const found = joined.get((data as { assignmentId: string }).assignmentId);
        return found ? ok(found) : fail('NOT_FOUND', 'Chưa tham gia bài này');
      }
      case 'student.fetch': {
        const denied = requireRole('student');
        if (denied) return denied;
        const found = joined.get((data as { assignmentId: string }).assignmentId);
        if (!found) return fail('NOT_FOUND', 'Chưa tham gia bài này');
        const operationId = simulateTransfer('fetch', found.id, found.totalSize, () => {
          found.receivedAt = new Date().toISOString();
          return {};
        });
        return ok({ operationId });
      }
      case 'student.submit': {
        const denied = requireRole('student');
        if (denied) return denied;
        const { assignmentId, selectionId } = data as { assignmentId: string; selectionId: string };
        const found = joined.get(assignmentId);
        if (!found) return fail('NOT_FOUND', 'Chưa tham gia bài này');
        const selection = selections.get(selectionId);
        if (!selection) return fail('SELECTION_EXPIRED', 'Lựa chọn file đã hết hạn, hãy chọn lại');
        const operationId = simulateTransfer('submit', assignmentId, selection.totalSize, () => {
          const previous = receipts.get(assignmentId);
          const receipt: Receipt = {
            ...fixtureReceipt,
            assignmentId,
            version: (previous?.version ?? 0) + 1,
            receivedAt: new Date().toISOString(),
            totalSize: selection.totalSize,
            fileCount: selection.fileCount,
          };
          receipts.set(assignmentId, receipt);
          return { receipt };
        });
        return ok({ operationId });
      }
      case 'student.getReceipt': {
        const denied = requireRole('student');
        if (denied) return denied;
        return ok(receipts.get((data as { assignmentId: string }).assignmentId) ?? null);
      }
    }
    return fail('INVALID_INPUT', `Kênh không tồn tại: ${String(channel)}`);
  }

  return {
    async invoke(channel, ...args) {
      await new Promise((resolve) => setTimeout(resolve, latencyMs));
      return (await handle(channel, args[0] as IpcInput<typeof channel>)) as IpcResult<IpcOutput<typeof channel>>;
    },
    on(event, listener) {
      let set = listeners.get(event);
      if (!set) listeners.set(event, (set = new Set()));
      set.add(listener as (payload: never) => void);
      return () => {
        set.delete(listener as (payload: never) => void);
      };
    },
    emit,
    listenerCount(event) {
      if (event) return listeners.get(event)?.size ?? 0;
      let total = 0;
      for (const set of listeners.values()) total += set.size;
      return total;
    },
  };
}
