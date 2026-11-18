/**
 * Dữ liệu mẫu đúng hợp đồng v1, dùng chung cho test và mock của mọi vai trò.
 * test/fixtures.test.ts kiểm tra từng mẫu bằng schema — sửa schema thì sửa mẫu ở đây.
 * Không chứa secret thật: token, mật khẩu, code croc đều là chuỗi giả.
 */
import type { ClientConfig, IssuedTicket, LecturerAssignment, LecturerAssignmentDetail, Receipt, Session, Student, StudentAssignmentDetail, StudentImportResult, SubmissionRow, TicketInfo, User } from '../dto.js';
import { DEFAULT_LIMITS } from '../constants.js';
import type { Manifest } from '../manifest.js';
import type { ServerMessage } from '../ws.js';

export const FIXTURE_NOW = '2026-11-17T08:00:00.000Z';

export const fixtureIds = {
  lecturer: '00000000-0000-4000-8000-000000000001',
  studentAn: '00000000-0000-4000-8000-000000000101',
  studentBinh: '00000000-0000-4000-8000-000000000102',
  studentChi: '00000000-0000-4000-8000-000000000103',
  assignmentPublished: '00000000-0000-4000-8000-000000000201',
  assignmentUploading: '00000000-0000-4000-8000-000000000202',
  submissionAnV1: '00000000-0000-4000-8000-000000000301',
  submissionAnV2: '00000000-0000-4000-8000-000000000302',
  ticketUpload: '00000000-0000-4000-8000-000000000401',
  ticketFetch: '00000000-0000-4000-8000-000000000402',
  ticketSubmit: '00000000-0000-4000-8000-000000000403',
  ticketCollect: '00000000-0000-4000-8000-000000000404',
} as const;

/** Thông tin đăng nhập dùng trong mock IPC và test. Không phải tài khoản thật. */
export const fixtureCredentials = {
  lecturer: { username: 'giangvien', password: 'matkhau-gv-123' },
  student: { mssv: '20210001', password: 'matkhau-sv-123' },
  activationCode: 'ABCD-EFGH-JKMN',
  codePhrase: 'sao-mai-xanh-042',
} as const;

const SHA_EMPTY = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
const SHA_HELLO = '5891b5b522d5df086d0ff0b110fbd9d21bb4fc7163af34d08286a2e846f6be03';
const SHA_PDF = '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08';

export const fixtureLecturerUser: User = {
  id: fixtureIds.lecturer,
  role: 'lecturer',
  username: fixtureCredentials.lecturer.username,
  fullName: 'Nguyễn Văn Giảng',
};

export const fixtureStudentUser: User = {
  id: fixtureIds.studentAn,
  role: 'student',
  mssv: fixtureCredentials.student.mssv,
  fullName: 'Trần Thị An',
  classLabel: 'CNTT-K66',
};

export const fixtureStudents: Student[] = [
  {
    id: fixtureIds.studentAn,
    mssv: '20210001',
    fullName: 'Trần Thị An',
    classLabel: 'CNTT-K66',
    activated: true,
    disabled: false,
    activationExpiresAt: null,
    createdAt: '2026-11-10T02:00:00.000Z',
  },
  {
    id: fixtureIds.studentBinh,
    mssv: '20210002',
    fullName: 'Lê Văn Bình',
    classLabel: 'CNTT-K66',
    activated: false,
    disabled: false,
    activationExpiresAt: '2026-11-24T02:00:00.000Z',
    createdAt: '2026-11-10T02:00:00.000Z',
  },
  {
    id: fixtureIds.studentChi,
    mssv: '20210003',
    fullName: 'Phạm Minh Chi',
    classLabel: null,
    activated: true,
    disabled: true,
    activationExpiresAt: null,
    createdAt: '2026-11-10T02:00:00.000Z',
  },
];

export const fixtureSession: Session = {
  token: 'fixture-session-token-0000000000000000000000',
  expiresAt: '2026-12-17T08:00:00.000Z',
  user: fixtureStudentUser,
};

/** Đề mẫu: tên file tiếng Việt (NFC), thư mục con, file rỗng. */
export const fixtureManifest: Manifest = {
  version: 1,
  files: [
    { path: 'Đề bài.pdf', size: 4, sha256: SHA_PDF },
    { path: 'du-lieu/hello.txt', size: 6, sha256: SHA_HELLO },
    { path: 'du-lieu/trống.txt', size: 0, sha256: SHA_EMPTY },
  ],
};

export const fixtureSubmissionManifest: Manifest = {
  version: 1,
  files: [{ path: 'bai-lam/main.py', size: 6, sha256: SHA_HELLO }],
};

const stats = { participants: 3, received: 2, seeding: 2, submitted: 1, late: 0, notSubmitted: 2 };

export const fixtureLecturerAssignment: LecturerAssignment = {
  id: fixtureIds.assignmentPublished,
  title: 'Bài tập 1 — Cấu trúc dữ liệu',
  description: 'Cài đặt danh sách liên kết.',
  deadlineAt: '2026-11-24T16:59:59.000Z',
  totalSize: 10,
  fileCount: 3,
  codePhrase: fixtureCredentials.codePhrase,
  status: 'da_phat_hanh',
  createdAt: '2026-11-17T07:50:00.000Z',
  publishedAt: '2026-11-17T07:52:00.000Z',
  stats,
};

export const fixtureLecturerAssignmentUploading: LecturerAssignment = {
  id: fixtureIds.assignmentUploading,
  title: 'Bài tập 2 — Đồ thị',
  description: '',
  deadlineAt: null,
  totalSize: 10,
  fileCount: 3,
  codePhrase: 'tre-xanh-vui-731',
  status: 'dang_tai_len',
  createdAt: '2026-11-17T07:58:00.000Z',
  publishedAt: null,
  stats: { participants: 0, received: 0, seeding: 0, submitted: 0, late: 0, notSubmitted: 0 },
};

export const fixtureLecturerAssignmentDetail: LecturerAssignmentDetail = {
  ...fixtureLecturerAssignment,
  manifest: fixtureManifest,
};

export const fixtureReceipt: Receipt = {
  submissionId: fixtureIds.submissionAnV2,
  assignmentId: fixtureIds.assignmentPublished,
  version: 2,
  receivedAt: '2026-11-17T09:30:00.000Z',
  isLate: false,
  totalSize: 6,
  fileCount: 1,
  manifestHash: 'a3c5f0c5e0b2b6f1d8e4a7c9b1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0',
};

export const fixtureStudentAssignmentDetail: StudentAssignmentDetail = {
  id: fixtureIds.assignmentPublished,
  title: fixtureLecturerAssignment.title,
  description: fixtureLecturerAssignment.description,
  deadlineAt: fixtureLecturerAssignment.deadlineAt,
  totalSize: 10,
  fileCount: 3,
  joinedAt: '2026-11-17T08:00:00.000Z',
  receivedAt: '2026-11-17T08:01:00.000Z',
  latestReceipt: fixtureReceipt,
  manifest: fixtureManifest,
};

export const fixtureIssuedTicket: IssuedTicket = {
  ticketId: fixtureIds.ticketFetch,
  kind: 'phat_de',
  assignmentId: fixtureIds.assignmentPublished,
  crocCode: 'fixture-croc-code-khong-phai-secret',
  expiresAt: '2026-11-17T08:02:00.000Z',
  totalBytes: 10,
};

export const fixtureTicketInfo: TicketInfo = {
  ticketId: fixtureIds.ticketSubmit,
  kind: 'nop_bai',
  assignmentId: fixtureIds.assignmentPublished,
  status: 'xong',
  createdAt: '2026-11-17T09:29:00.000Z',
  expiresAt: '2026-11-17T09:31:00.000Z',
  finishedAt: '2026-11-17T09:30:00.000Z',
  failureReason: null,
  receipt: fixtureReceipt,
};

export const fixtureSubmissionRows: SubmissionRow[] = [
  {
    student: { id: fixtureIds.studentAn, mssv: '20210001', fullName: 'Trần Thị An', classLabel: 'CNTT-K66' },
    state: 'da_nop',
    submitCount: 2,
    latest: {
      submissionId: fixtureIds.submissionAnV2,
      version: 2,
      receivedAt: fixtureReceipt.receivedAt,
      isLate: false,
      totalSize: 6,
      fileCount: 1,
      manifestHash: fixtureReceipt.manifestHash,
      collectedAt: null,
    },
  },
  {
    student: { id: fixtureIds.studentBinh, mssv: '20210002', fullName: 'Lê Văn Bình', classLabel: 'CNTT-K66' },
    state: 'chua_nop',
    submitCount: 0,
    latest: null,
  },
];

export const fixtureClientConfig: ClientConfig = {
  relay: { address: 'relay.example.test:9009', password: 'fixture-relay-pass' },
  limits: DEFAULT_LIMITS,
  serverTime: FIXTURE_NOW,
};

export const fixtureImportResult: StudentImportResult = {
  imported: true,
  created: [
    {
      student: fixtureStudents[1]!,
      activation: {
        studentId: fixtureIds.studentBinh,
        mssv: '20210002',
        activationCode: fixtureCredentials.activationCode,
        activationExpiresAt: '2026-12-01T08:00:00.000Z',
      },
    },
  ],
  skipped: [{ line: 3, mssv: '20210001', reason: 'already_exists' }],
  errors: [],
};

export const fixtureServerMessages: ServerMessage[] = [
  { type: 'welcome', userId: fixtureIds.studentAn, serverTime: FIXTURE_NOW, heartbeatSeconds: 25 },
  {
    type: 'serve.request',
    ticketId: fixtureIds.ticketFetch,
    assignmentId: fixtureIds.assignmentPublished,
    crocCode: fixtureIssuedTicket.crocCode,
    expiresAt: fixtureIssuedTicket.expiresAt,
  },
  { type: 'ticket.ready', ticket: fixtureIssuedTicket },
  { type: 'ticket.cancel', ticketId: fixtureIds.ticketFetch, reason: 'timeout' },
  {
    type: 'ticket.updated',
    ticketId: fixtureIds.ticketSubmit,
    kind: 'nop_bai',
    assignmentId: fixtureIds.assignmentPublished,
    status: 'xong',
    failureReason: null,
    receipt: fixtureReceipt,
  },
  { type: 'queue.position', assignmentId: fixtureIds.assignmentPublished, position: 2 },
  { type: 'submission.new', assignmentId: fixtureIds.assignmentPublished, submissionId: fixtureIds.submissionAnV2, version: 2 },
  { type: 'assignment.published', assignmentId: fixtureIds.assignmentPublished },
  { type: 'assignment.deleted', assignmentId: fixtureIds.assignmentUploading },
  { type: 'seed.rejected', assignmentId: fixtureIds.assignmentPublished, reason: 'not_holder' },
  { type: 'error', code: 'bad_message', message: 'Thông điệp không hợp lệ' },
];
