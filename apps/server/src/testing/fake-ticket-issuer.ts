import { randomUUID } from 'node:crypto';
import { ticketLifetimeMs, DEFAULT_LIMITS, type IssuedTicket, type Manifest, type TicketKind } from '@croc-classroom/shared';
import type { Db } from '../db/index.js';
import { appError } from '../http/errors.js';
import { systemClock, type Clock } from '../ports/clock.js';
import type { TicketIssuer, TransferOutcomeHandler } from '../ports/transfers.js';

/**
 * TicketIssuer GIẢ để C test nghiệp vụ khi chưa có dịch vụ vé/worker thật của D.
 * Không chạy croc, không lưu file. Nếu có `db`, ghi vé vào bảng `tickets` và huỷ vé cũ cùng khoá
 * (`superseded`) đúng như hợp đồng yêu cầu D làm — để test được logic phiên bản bài nộp.
 * Test tự gọi TransferOutcomeHandler để giả lập worker báo kết quả.
 *
 * `autoComplete()` (chế độ DEV_FAKE_TRANSFERS): sau mỗi vé, tự báo kết quả thành công (đề đã lưu,
 * bài nộp đã lưu, GV đã tải) mà không truyền file — chỉ để A/B thử giao diện với server thật.
 */
type IssueRequest =
  | { kind: 'gv_tai_len'; assignmentId: string; lecturerId: string; manifest: Manifest; totalBytes: number }
  | { kind: 'nop_bai'; assignmentId: string; studentId: string; manifest: Manifest; totalBytes: number }
  | {
      kind: 'gv_thu_bai';
      assignmentId: string;
      submissionId: string;
      lecturerId: string;
      storageRef: string;
      manifest: Manifest;
      totalBytes: number;
    };

export class FakeTicketIssuer implements TicketIssuer {
  readonly issued: (IssuedTicket & { request: Record<string, unknown> })[] = [];
  readonly purged: string[] = [];
  /** Đặt true để giả lập bể tiến trình VPS đã đầy. */
  full = false;
  private auto?: { handler: TransferOutcomeHandler; delayMs: number };

  constructor(
    private readonly clock: Clock = systemClock,
    private readonly db?: Db,
  ) {}

  autoComplete(handler: TransferOutcomeHandler, delayMs = 1000): void {
    this.auto = { handler, delayMs };
  }

  private issue(request: IssueRequest): IssuedTicket {
    if (this.full) throw appError('CAPACITY_EXHAUSTED', undefined, { retryAfterSeconds: 30 });
    const now = this.clock.now();
    const ticket: IssuedTicket = {
      ticketId: randomUUID(),
      kind: request.kind,
      assignmentId: request.assignmentId,
      crocCode: `fake-${randomUUID()}`,
      expiresAt: new Date(now.getTime() + ticketLifetimeMs(request.totalBytes, DEFAULT_LIMITS)).toISOString(),
      totalBytes: request.totalBytes,
    };
    if (this.db) this.record(ticket, request, now.toISOString());
    this.issued.push({ ...ticket, request });
    if (this.auto) this.scheduleCompletion(ticket, request, this.auto);
    return ticket;
  }

  /** Ghi vé `dang_chay`, huỷ vé chưa kết thúc cùng khoá (ports/transfers.ts). */
  private record(ticket: IssuedTicket, request: IssueRequest, now: string): void {
    const db = this.db!;
    const row = {
      id: ticket.ticketId,
      kind: request.kind as TicketKind,
      assignment_id: request.assignmentId,
      sender_kind: request.kind === 'gv_thu_bai' ? 'vps' : 'user',
      sender_user_id: request.kind === 'gv_tai_len' ? request.lecturerId : request.kind === 'nop_bai' ? request.studentId : null,
      receiver_kind: request.kind === 'gv_thu_bai' ? 'user' : 'vps',
      receiver_user_id: request.kind === 'gv_thu_bai' ? request.lecturerId : null,
      submission_id: request.kind === 'gv_thu_bai' ? request.submissionId : null,
      bytes: request.totalBytes,
      created_at: now,
      expires_at: ticket.expiresAt,
    };
    const keyClause =
      request.kind === 'gv_tai_len'
        ? 'assignment_id = @assignment_id'
        : request.kind === 'nop_bai'
          ? 'assignment_id = @assignment_id AND sender_user_id = @sender_user_id'
          : 'submission_id = @submission_id';
    db.transaction(() => {
      db.prepare(
        `UPDATE tickets SET status = 'huy', failure_reason = 'superseded', finished_at = @created_at
         WHERE kind = @kind AND status IN ('cho', 'dang_chay') AND ${keyClause}`,
      ).run(row);
      db.prepare(
        `INSERT INTO tickets (id, kind, assignment_id, sender_kind, sender_user_id, receiver_kind, receiver_user_id,
           submission_id, status, bytes, created_at, expires_at)
         VALUES (@id, @kind, @assignment_id, @sender_kind, @sender_user_id, @receiver_kind, @receiver_user_id,
           @submission_id, 'dang_chay', @bytes, @created_at, @expires_at)`,
      ).run(row);
    })();
  }

  private scheduleCompletion(ticket: IssuedTicket, request: IssueRequest, auto: { handler: TransferOutcomeHandler; delayMs: number }): void {
    setTimeout(() => {
      const at = this.clock.now().toISOString();
      if (request.kind === 'gv_tai_len') {
        void auto.handler.onUploadStored({ ticketId: ticket.ticketId, assignmentId: request.assignmentId, storageRef: `fake/assignments/${request.assignmentId}`, verifiedAt: at });
      } else if (request.kind === 'nop_bai') {
        void auto.handler.onSubmissionStored({
          ticketId: ticket.ticketId,
          assignmentId: request.assignmentId,
          studentId: request.studentId,
          manifest: request.manifest,
          storageRef: `fake/submissions/${ticket.ticketId}`,
          verifiedAt: at,
        });
      } else {
        void auto.handler.onCollectConfirmed({ ticketId: ticket.ticketId, submissionId: request.submissionId, confirmedAt: at });
      }
    }, auto.delayMs);
  }

  async openUpload(request: Parameters<TicketIssuer['openUpload']>[0]): Promise<IssuedTicket> {
    return this.issue({ kind: 'gv_tai_len', ...request });
  }

  async openSubmission(request: Parameters<TicketIssuer['openSubmission']>[0]): Promise<IssuedTicket> {
    return this.issue({ kind: 'nop_bai', ...request });
  }

  async openCollect(request: Parameters<TicketIssuer['openCollect']>[0]): Promise<IssuedTicket> {
    return this.issue({ kind: 'gv_thu_bai', ...request });
  }

  async purgeAssignment(assignmentId: string): Promise<void> {
    this.purged.push(assignmentId);
  }
}
