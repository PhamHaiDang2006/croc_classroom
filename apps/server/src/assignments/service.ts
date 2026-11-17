import { randomUUID } from 'node:crypto';
import {
  checkManifestLimits,
  ManifestSchema,
  manifestTotalSize,
  type AssignmentStats,
  type AssignmentStatus,
  type CreateAssignmentRequestSchema,
  type IssuedTicket,
  type LecturerAssignment,
  type LecturerAssignmentDetail,
  type Limits,
  type Manifest,
  type StudentAssignment,
  type StudentAssignmentDetail,
  type UpdateAssignmentRequestSchema,
} from '@croc-classroom/shared';
import { generateCodePhrase } from '@croc-classroom/shared/node';
import type { z } from 'zod';
import type { Db } from '../db/index.js';
import { appError } from '../http/errors.js';
import type { FailureLimiter } from '../http/rate-limit.js';
import type { Clock } from '../ports/clock.js';
import type { SeedingStats } from '../ports/seeding.js';
import type { TicketIssuer, TransferOutcomeHandler } from '../ports/transfers.js';
import { latestReceipt } from '../submissions/queries.js';

interface AssignmentRow {
  id: string;
  title: string;
  description: string;
  code_phrase: string;
  deadline_at: string | null;
  status: AssignmentStatus;
  manifest_json: string;
  total_size: number;
  file_count: number;
  created_at: string;
  published_at: string | null;
  storage_ref: string | null;
}

interface ParticipantRow {
  joined_at: string;
  received_at: string | null;
}

export interface AssignmentsServiceDeps {
  db: Db;
  clock: Clock;
  limits: Limits;
  tickets: TicketIssuer;
  seeding: SeedingStats;
  /** Đếm số lần nhập sai code phrase (system-design mục 8). */
  joinLimiter: FailureLimiter;
}

/** Phần TransferOutcomeHandler do module bài tập đảm nhận. */
export type AssignmentOutcomes = Pick<TransferOutcomeHandler, 'onUploadStored' | 'onFetchVerified'>;

const MAX_CODE_PHRASE_ATTEMPTS = 20;

export class AssignmentsService implements AssignmentOutcomes {
  constructor(private readonly deps: AssignmentsServiceDeps) {}

  private get db(): Db {
    return this.deps.db;
  }

  // ------------------------------------------------------------ giảng viên

  async create(
    lecturerId: string,
    request: z.output<typeof CreateAssignmentRequestSchema>,
  ): Promise<{ assignment: LecturerAssignment; ticket: IssuedTicket }> {
    const manifest = request.manifest;
    this.assertManifestWithinLimits(manifest);

    const id = randomUUID();
    const totalBytes = manifestTotalSize(manifest);
    this.db
      .prepare(
        `INSERT INTO assignments (id, title, description, code_phrase, deadline_at, status, manifest_json, total_size, file_count, created_at)
         VALUES (?, ?, ?, ?, ?, 'dang_tai_len', ?, ?, ?, ?)`,
      )
      .run(
        id,
        request.title,
        request.description,
        this.uniqueCodePhrase(),
        request.deadlineAt,
        JSON.stringify(manifest),
        totalBytes,
        manifest.files.length,
        this.deps.clock.now().toISOString(),
      );

    let ticket: IssuedTicket;
    try {
      ticket = await this.deps.tickets.openUpload({ assignmentId: id, lecturerId, manifest, totalBytes });
    } catch (error) {
      // Không mở được vé (VPS hết chỗ…): không để lại bài không thể tải lên.
      this.db.prepare('DELETE FROM assignments WHERE id = ?').run(id);
      throw error;
    }
    return { assignment: this.toLecturerAssignment(this.requireRow(id)), ticket };
  }

  async renewUploadTicket(lecturerId: string, assignmentId: string): Promise<{ ticket: IssuedTicket }> {
    const row = this.requireRow(assignmentId);
    if (row.status === 'da_phat_hanh') throw appError('ASSIGNMENT_ALREADY_PUBLISHED');
    const manifest = parseManifest(row.manifest_json);
    const ticket = await this.deps.tickets.openUpload({
      assignmentId,
      lecturerId,
      manifest,
      totalBytes: row.total_size,
    });
    return { ticket };
  }

  list(): LecturerAssignment[] {
    const rows = this.db.prepare('SELECT * FROM assignments ORDER BY created_at DESC, id').all() as AssignmentRow[];
    return rows.map((row) => this.toLecturerAssignment(row));
  }

  get(assignmentId: string): LecturerAssignmentDetail {
    const row = this.requireRow(assignmentId);
    return { ...this.toLecturerAssignment(row), manifest: parseManifest(row.manifest_json) };
  }

  update(assignmentId: string, changes: z.output<typeof UpdateAssignmentRequestSchema>): LecturerAssignment {
    this.requireRow(assignmentId);
    // Chỉ ba cột này được sửa; tên cột cố định trong mã, không lấy từ đầu vào.
    const columns = { title: 'title', description: 'description', deadlineAt: 'deadline_at' } as const;
    const entries = (Object.keys(columns) as (keyof typeof columns)[]).filter((key) => changes[key] !== undefined);
    const sets = entries.map((key) => `${columns[key]} = ?`).join(', ');
    this.db.prepare(`UPDATE assignments SET ${sets} WHERE id = ?`).run(...entries.map((key) => changes[key]), assignmentId);
    return this.toLecturerAssignment(this.requireRow(assignmentId));
  }

  /**
   * Xoá bài: nhờ D huỷ vé, báo seeder, xoá file trên VPS; xong mới xoá dữ liệu (dây chuyền:
   * participants, holdings, submissions, tickets). D lỗi thì giữ nguyên bài để GV xoá lại.
   */
  async delete(assignmentId: string): Promise<void> {
    this.requireRow(assignmentId);
    await this.deps.tickets.purgeAssignment(assignmentId);
    this.db.prepare('DELETE FROM assignments WHERE id = ?').run(assignmentId);
  }

  // ------------------------------------------------------------ sinh viên

  join(studentId: string, codePhrase: string, ip: string): StudentAssignmentDetail {
    const key = `join:${studentId}|${ip}`;
    this.deps.joinLimiter.assertAllowed(key);

    const row = this.db
      .prepare(`SELECT * FROM assignments WHERE code_phrase = ? AND status = 'da_phat_hanh'`)
      .get(codePhrase) as AssignmentRow | undefined;
    if (!row) {
      this.deps.joinLimiter.recordFailure(key);
      throw appError('CODE_PHRASE_INVALID');
    }
    this.deps.joinLimiter.reset(key);

    this.db.transaction(() => {
      if (this.participant(row.id, studentId)) return;
      const { n } = this.db.prepare('SELECT COUNT(*) AS n FROM participants WHERE assignment_id = ?').get(row.id) as { n: number };
      if (n >= this.deps.limits.maxStudentsPerAssignment) throw appError('ASSIGNMENT_FULL');
      this.db
        .prepare('INSERT INTO participants (assignment_id, student_id, joined_at) VALUES (?, ?, ?)')
        .run(row.id, studentId, this.deps.clock.now().toISOString());
    })();
    return this.studentDetail(row, studentId);
  }

  myAssignments(studentId: string): StudentAssignment[] {
    const rows = this.db
      .prepare(
        `SELECT a.* FROM assignments a JOIN participants p ON p.assignment_id = a.id
         WHERE p.student_id = ? ORDER BY p.joined_at DESC, a.id`,
      )
      .all(studentId) as AssignmentRow[];
    return rows.map((row) => {
      const { manifest: _manifest, ...rest } = this.studentDetail(row, studentId);
      return rest;
    });
  }

  myAssignment(studentId: string, assignmentId: string): StudentAssignmentDetail {
    const row = this.findRow(assignmentId);
    // Chưa tham gia thì coi như không tồn tại (không tiết lộ bài của người khác).
    if (!row || !this.participant(assignmentId, studentId)) throw appError('NOT_FOUND');
    return this.studentDetail(row, studentId);
  }

  // ------------------------------------------------------------ kết quả truyền file (D gọi)

  async onUploadStored(event: { ticketId: string; assignmentId: string; storageRef: string; verifiedAt: string }): Promise<void> {
    this.db
      .prepare(
        `UPDATE assignments SET status = 'da_phat_hanh', published_at = ?, storage_ref = ?
         WHERE id = ? AND status = 'dang_tai_len'`,
      )
      .run(event.verifiedAt, event.storageRef, event.assignmentId);
  }

  async onFetchVerified(event: {
    ticketId: string;
    assignmentId: string;
    studentId: string;
    source: 'vps' | 'peer' | 'lecturer';
    verifiedAt: string;
  }): Promise<void> {
    this.db
      .prepare(
        `UPDATE participants SET received_at = ?, received_from = ?
         WHERE assignment_id = ? AND student_id = ? AND received_at IS NULL`,
      )
      .run(event.verifiedAt, event.source, event.assignmentId, event.studentId);
  }

  // ------------------------------------------------------------ tiện ích

  private assertManifestWithinLimits(manifest: Manifest): void {
    const problems = checkManifestLimits(manifest, {
      maxFiles: this.deps.limits.maxManifestFiles,
      maxBytes: this.deps.limits.maxAssignmentBytes,
    });
    const tooLarge = problems.find((p) => p.code === 'too_large');
    if (tooLarge) throw appError('PAYLOAD_TOO_LARGE', tooLarge.message);
    const tooMany = problems.find((p) => p.code === 'too_many_files');
    if (tooMany) throw appError('MANIFEST_INVALID', tooMany.message);
  }

  private uniqueCodePhrase(): string {
    const exists = this.db.prepare('SELECT 1 FROM assignments WHERE code_phrase = ?');
    for (let attempt = 0; attempt < MAX_CODE_PHRASE_ATTEMPTS; attempt++) {
      const phrase = generateCodePhrase();
      if (!exists.get(phrase)) return phrase;
    }
    throw appError('INTERNAL', 'Không sinh được code phrase không trùng');
  }

  private findRow(assignmentId: string): AssignmentRow | undefined {
    return this.db.prepare('SELECT * FROM assignments WHERE id = ?').get(assignmentId) as AssignmentRow | undefined;
  }

  private requireRow(assignmentId: string): AssignmentRow {
    const row = this.findRow(assignmentId);
    if (!row) throw appError('NOT_FOUND', 'Không tìm thấy bài tập');
    return row;
  }

  private participant(assignmentId: string, studentId: string): ParticipantRow | undefined {
    return this.db
      .prepare('SELECT joined_at, received_at FROM participants WHERE assignment_id = ? AND student_id = ?')
      .get(assignmentId, studentId) as ParticipantRow | undefined;
  }

  stats(assignmentId: string): AssignmentStats {
    const counts = this.db
      .prepare(
        `SELECT
           (SELECT COUNT(*) FROM participants WHERE assignment_id = @id) AS participants,
           (SELECT COUNT(*) FROM participants WHERE assignment_id = @id AND received_at IS NOT NULL) AS received,
           (SELECT COUNT(DISTINCT student_id) FROM submissions WHERE assignment_id = @id) AS submitted,
           (SELECT COUNT(*) FROM submissions s
              WHERE s.assignment_id = @id AND s.is_late = 1
                AND s.version = (SELECT MAX(version) FROM submissions WHERE assignment_id = @id AND student_id = s.student_id)
           ) AS late`,
      )
      .get({ id: assignmentId }) as { participants: number; received: number; submitted: number; late: number };
    return {
      ...counts,
      seeding: this.deps.seeding.seedingCount(assignmentId),
      notSubmitted: Math.max(0, counts.participants - counts.submitted),
    };
  }

  private toLecturerAssignment(row: AssignmentRow): LecturerAssignment {
    return {
      id: row.id,
      title: row.title,
      description: row.description,
      deadlineAt: row.deadline_at,
      totalSize: row.total_size,
      fileCount: row.file_count,
      codePhrase: row.code_phrase,
      status: row.status,
      createdAt: row.created_at,
      publishedAt: row.published_at,
      stats: this.stats(row.id),
    };
  }

  private studentDetail(row: AssignmentRow, studentId: string): StudentAssignmentDetail {
    const participant = this.participant(row.id, studentId)!;
    return {
      id: row.id,
      title: row.title,
      description: row.description,
      deadlineAt: row.deadline_at,
      totalSize: row.total_size,
      fileCount: row.file_count,
      joinedAt: participant.joined_at,
      receivedAt: participant.received_at,
      latestReceipt: latestReceipt(this.db, row.id, studentId),
      manifest: parseManifest(row.manifest_json),
    };
  }
}

/** Manifest lưu trong CSDL đã được kiểm tra khi tạo; kiểm lại để phát hiện dữ liệu hỏng. */
function parseManifest(json: string): Manifest {
  return ManifestSchema.parse(JSON.parse(json));
}
