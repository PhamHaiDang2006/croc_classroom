import { randomUUID } from 'node:crypto';
import {
  ManifestSchema,
  manifestTotalSize,
  type CollectTicket,
  type IssuedTicket,
  type Limits,
  type Manifest,
  type Receipt,
  type SubmissionRow as SubmissionRowDto,
} from '@croc-classroom/shared';
import { manifestHash } from '@croc-classroom/shared/node';
import type { Db } from '../db/index.js';
import { appError } from '../http/errors.js';
import { assertManifestWithinLimits } from '../manifest-limits.js';
import type { Clock } from '../ports/clock.js';
import type { SubmissionCommitResult, TicketIssuer, TransferOutcomeHandler } from '../ports/transfers.js';
import { latestReceipt, toReceipt, type SubmissionRow } from './queries.js';
import { assignmentAvailable, requireAvailableAssignment, withAssignmentLock } from '../ports/assignment-lifecycle.js';

export interface SubmissionsServiceDeps {
  db: Db;
  clock: Clock;
  limits: Limits;
  tickets: TicketIssuer;
}

/** Phần TransferOutcomeHandler do module bài nộp đảm nhận. */
export type SubmissionOutcomes = Pick<TransferOutcomeHandler, 'onSubmissionStored' | 'onCollectConfirmed'>;

interface StudentRefRow {
  id: string;
  mssv: string;
  full_name: string;
  class_label: string | null;
}

interface TicketRow {
  id: string;
  kind: string;
  assignment_id: string;
  sender_user_id: string | null;
  status: string;
  submission_id: string | null;
  expires_at: string;
}

export class SubmissionsService implements SubmissionOutcomes {
  constructor(private readonly deps: SubmissionsServiceDeps) {}

  private get db(): Db {
    return this.deps.db;
  }

  // ------------------------------------------------------------ sinh viên

  /** Xin vé nộp bài (system-design mục 7.5). Biên nhận có khi worker xác minh xong (onSubmissionStored). */
  async submit(studentId: string, assignmentId: string, manifest: Manifest): Promise<{ ticket: IssuedTicket }> {
    return withAssignmentLock(this.db, assignmentId, async () => {
      requireAvailableAssignment(this.db, assignmentId);
      this.requireAssignment(assignmentId);
      if (!this.isParticipant(assignmentId, studentId)) throw appError('NOT_PARTICIPANT');

      assertManifestWithinLimits(manifest, {
        maxFiles: this.deps.limits.maxManifestFiles,
        maxBytes: this.deps.limits.maxSubmissionBytes,
      });

      const ticket = await this.deps.tickets.openSubmission({
        assignmentId,
        studentId,
        manifest,
        totalBytes: manifestTotalSize(manifest),
      });
      return { ticket };
    });
  }

  /** Biên nhận mới nhất của chính SV (dùng sau khi mất kết nối). Chưa tham gia / chưa nộp → NOT_FOUND. */
  myReceipt(studentId: string, assignmentId: string): Receipt {
    if (!this.isParticipant(assignmentId, studentId)) throw appError('NOT_FOUND');
    const receipt = latestReceipt(this.db, assignmentId, studentId);
    if (!receipt) throw appError('NOT_FOUND', 'Bạn chưa nộp bài này');
    return receipt;
  }

  // ------------------------------------------------------------ giảng viên

  /** Một dòng cho mỗi SV đã tham gia (system-design mục 7.6), sắp theo MSSV. */
  list(assignmentId: string): SubmissionRowDto[] {
    this.requireAssignment(assignmentId);
    const students = this.db
      .prepare(
        `SELECT u.id, u.mssv, u.full_name, u.class_label FROM participants p
         JOIN users u ON u.id = p.student_id
         WHERE p.assignment_id = ? ORDER BY u.mssv`,
      )
      .all(assignmentId) as StudentRefRow[];
    const count = this.db.prepare('SELECT COUNT(*) AS n FROM submissions WHERE assignment_id = ? AND student_id = ?');
    return students.map((student) => {
      const latest = this.latestRow(assignmentId, student.id);
      const { n } = count.get(assignmentId, student.id) as { n: number };
      return {
        student: { id: student.id, mssv: student.mssv, fullName: student.full_name, classLabel: student.class_label },
        state: !latest ? 'chua_nop' : latest.is_late === 1 ? 'nop_tre' : 'da_nop',
        submitCount: n,
        latest: latest
          ? {
              submissionId: latest.id,
              version: latest.version,
              receivedAt: latest.received_at,
              isLate: latest.is_late === 1,
              totalSize: latest.total_size,
              fileCount: latest.file_count,
              manifestHash: latest.manifest_hash,
              collectedAt: latest.collected_at,
            }
          : null,
      };
    });
  }

  /** Mở vé gv_thu_bai cho đúng phiên bản `submissionId`; phiên bản đã bị thay → SUBMISSION_SUPERSEDED. */
  async collect(lecturerId: string, submissionId: string): Promise<CollectTicket> {
    const ref = this.db.prepare('SELECT assignment_id FROM submissions WHERE id = ?').get(submissionId) as { assignment_id: string } | undefined;
    if (!ref) throw appError('NOT_FOUND');
    return withAssignmentLock(this.db, ref.assignment_id, async () => {
      requireAvailableAssignment(this.db, ref.assignment_id);
      const row = this.db.prepare('SELECT * FROM submissions WHERE id = ?').get(submissionId) as SubmissionRow | undefined;
      if (!row) throw appError('NOT_FOUND', 'Không tìm thấy bài nộp');
      const latest = this.latestRow(row.assignment_id, row.student_id)!;
      if (latest.id !== row.id || !row.storage_ref) throw appError('SUBMISSION_SUPERSEDED');

      const manifest = ManifestSchema.parse(JSON.parse(row.manifest_json));
      const ticket = await this.deps.tickets.openCollect({
        assignmentId: row.assignment_id,
        submissionId: row.id,
        lecturerId,
        storageRef: row.storage_ref,
        manifest,
        totalBytes: row.total_size,
      });
      const student = this.db
        .prepare('SELECT id, mssv, full_name, class_label FROM users WHERE id = ?')
        .get(row.student_id) as StudentRefRow;
      return {
        ticket,
        submission: {
          submissionId: row.id,
          assignmentId: row.assignment_id,
          student: { id: student.id, mssv: student.mssv, fullName: student.full_name, classLabel: student.class_label },
          version: row.version,
          manifest,
          manifestHash: row.manifest_hash,
        },
      };
    });
  }

  // ------------------------------------------------------------ kết quả truyền file (D gọi)

  async onSubmissionStored(event: {
    ticketId: string;
    assignmentId: string;
    studentId: string;
    manifest: Manifest;
    storageRef: string;
    verifiedAt: string;
  }): Promise<SubmissionCommitResult> {
    return withAssignmentLock(this.db, event.assignmentId, async () => this.db.transaction((): SubmissionCommitResult => {
      if (!assignmentAvailable(this.db, event.assignmentId)) return { accepted: false, reason: 'ticket_not_active' };
      const ticket = this.db.prepare('SELECT * FROM tickets WHERE id = ?').get(event.ticketId) as TicketRow | undefined;
      const matches =
        ticket !== undefined &&
        ticket.kind === 'nop_bai' &&
        ticket.assignment_id === event.assignmentId &&
        ticket.sender_user_id === event.studentId;
      if (!matches) return { accepted: false, reason: 'ticket_not_active' };

      // Gọi lặp sau khi đã commit: trả lại đúng biên nhận, không tạo phiên bản mới.
      if (ticket.status === 'xong' && ticket.submission_id) {
        const committed = this.db.prepare('SELECT * FROM submissions WHERE id = ?').get(ticket.submission_id) as SubmissionRow | undefined;
        if (committed) return { accepted: true, receipt: toReceipt(committed), supersededStorageRefs: [] };
      }
      if (ticket.status !== 'dang_chay' || Date.parse(ticket.expires_at) <= this.deps.clock.now().getTime()) {
        return { accepted: false, reason: 'ticket_not_active' };
      }

      const assignment = this.db.prepare('SELECT deadline_at FROM assignments WHERE id = ?').get(event.assignmentId) as
        | { deadline_at: string | null }
        | undefined;
      if (!assignment || !this.isParticipant(event.assignmentId, event.studentId)) {
        return { accepted: false, reason: 'ticket_not_active' };
      }

      const previous = this.latestRow(event.assignmentId, event.studentId);
      const superseded = this.db
        .prepare('SELECT storage_ref FROM submissions WHERE assignment_id = ? AND student_id = ? AND storage_ref IS NOT NULL')
        .all(event.assignmentId, event.studentId)
        .map((r) => (r as { storage_ref: string }).storage_ref);

      const row: SubmissionRow = {
        id: randomUUID(),
        assignment_id: event.assignmentId,
        student_id: event.studentId,
        version: (previous?.version ?? 0) + 1,
        received_at: event.verifiedAt,
        is_late: assignment.deadline_at !== null && Date.parse(event.verifiedAt) > Date.parse(assignment.deadline_at) ? 1 : 0,
        total_size: manifestTotalSize(event.manifest),
        file_count: event.manifest.files.length,
        manifest_json: JSON.stringify(event.manifest),
        manifest_hash: manifestHash(event.manifest),
        storage_ref: event.storageRef,
        collected_at: null,
      };
      // Durable cleanup outbox: callback retries must not lose retired storage references.
      this.db.prepare(`INSERT OR IGNORE INTO payload_gc (storage_ref, assignment_id, submission_id)
        SELECT storage_ref, assignment_id, id FROM submissions
        WHERE assignment_id = ? AND student_id = ? AND storage_ref IS NOT NULL`)
        .run(event.assignmentId, event.studentId);
      this.db
        .prepare('UPDATE submissions SET storage_ref = NULL WHERE assignment_id = ? AND student_id = ?')
        .run(event.assignmentId, event.studentId);
      this.db
        .prepare(
          `INSERT INTO submissions (id, assignment_id, student_id, version, received_at, is_late, total_size, file_count,
             manifest_json, manifest_hash, storage_ref, collected_at)
           VALUES (@id, @assignment_id, @student_id, @version, @received_at, @is_late, @total_size, @file_count,
             @manifest_json, @manifest_hash, @storage_ref, @collected_at)`,
        )
        .run(row);
      this.db
        .prepare(`UPDATE tickets SET status = 'xong', finished_at = ?, submission_id = ? WHERE id = ?`)
        .run(this.deps.clock.now().toISOString(), row.id, event.ticketId);

      return { accepted: true, receipt: toReceipt(row), supersededStorageRefs: superseded };
    })());
  }

  async onCollectConfirmed(event: { ticketId: string; submissionId: string; confirmedAt: string }): Promise<void> {
    const ref = this.db.prepare('SELECT assignment_id FROM submissions WHERE id = ?').get(event.submissionId) as { assignment_id: string } | undefined;
    if (!ref) return;
    await withAssignmentLock(this.db, ref.assignment_id, async () => {
      if (!assignmentAvailable(this.db, ref.assignment_id)) return;
      this.db.transaction(() => {
        const ticket = this.db.prepare('SELECT * FROM tickets WHERE id = ?').get(event.ticketId) as TicketRow | undefined;
        if (!ticket || ticket.kind !== 'gv_thu_bai' || ticket.submission_id !== event.submissionId
          || ticket.assignment_id !== ref.assignment_id || ticket.status !== 'dang_chay'
          || Date.parse(ticket.expires_at) <= this.deps.clock.now().getTime()) return;
        this.db.prepare('UPDATE submissions SET collected_at = ? WHERE id = ? AND collected_at IS NULL')
          .run(event.confirmedAt, event.submissionId);
        this.db.prepare(`UPDATE tickets SET status = 'xong', finished_at = ? WHERE id = ?`)
          .run(this.deps.clock.now().toISOString(), event.ticketId);
      })();
    });
  }

  // ------------------------------------------------------------ tiện ích

  private requireAssignment(assignmentId: string): void {
    if (!this.db.prepare('SELECT 1 FROM assignments WHERE id = ?').get(assignmentId)) {
      throw appError('NOT_FOUND', 'Không tìm thấy bài tập');
    }
  }

  private isParticipant(assignmentId: string, studentId: string): boolean {
    return this.db.prepare('SELECT 1 FROM participants WHERE assignment_id = ? AND student_id = ?').get(assignmentId, studentId) !== undefined;
  }

  private latestRow(assignmentId: string, studentId: string): SubmissionRow | undefined {
    return this.db
      .prepare('SELECT * FROM submissions WHERE assignment_id = ? AND student_id = ? ORDER BY version DESC LIMIT 1')
      .get(assignmentId, studentId) as SubmissionRow | undefined;
  }
}
