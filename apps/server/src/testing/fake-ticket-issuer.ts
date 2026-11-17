import { randomUUID } from 'node:crypto';
import { ticketLifetimeMs, DEFAULT_LIMITS, type IssuedTicket, type TicketKind } from '@croc-classroom/shared';
import { appError } from '../http/errors.js';
import { systemClock, type Clock } from '../ports/clock.js';
import type { TicketIssuer } from '../ports/transfers.js';

/**
 * TicketIssuer GIẢ để C test nghiệp vụ khi chưa có dịch vụ vé/worker thật của D.
 * Chỉ cấp vé và ghi lại lời gọi; không chạy croc, không lưu file. Test tự gọi
 * TransferOutcomeHandler để giả lập worker báo kết quả.
 */
export class FakeTicketIssuer implements TicketIssuer {
  readonly issued: (IssuedTicket & { request: Record<string, unknown> })[] = [];
  readonly purged: string[] = [];
  /** Đặt true để giả lập bể tiến trình VPS đã đầy. */
  full = false;

  constructor(private readonly clock: Clock = systemClock) {}

  private issue(kind: TicketKind, assignmentId: string, totalBytes: number, request: Record<string, unknown>): IssuedTicket {
    if (this.full) throw appError('CAPACITY_EXHAUSTED', undefined, { retryAfterSeconds: 30 });
    const ticket: IssuedTicket = {
      ticketId: randomUUID(),
      kind,
      assignmentId,
      crocCode: `fake-${randomUUID()}`,
      expiresAt: new Date(this.clock.now().getTime() + ticketLifetimeMs(totalBytes, DEFAULT_LIMITS)).toISOString(),
      totalBytes,
    };
    this.issued.push({ ...ticket, request });
    return ticket;
  }

  async openUpload(request: Parameters<TicketIssuer['openUpload']>[0]): Promise<IssuedTicket> {
    return this.issue('gv_tai_len', request.assignmentId, request.totalBytes, request);
  }

  async openSubmission(request: Parameters<TicketIssuer['openSubmission']>[0]): Promise<IssuedTicket> {
    return this.issue('nop_bai', request.assignmentId, request.totalBytes, request);
  }

  async openCollect(request: Parameters<TicketIssuer['openCollect']>[0]): Promise<IssuedTicket> {
    return this.issue('gv_thu_bai', request.assignmentId, request.totalBytes, request);
  }

  async purgeAssignment(assignmentId: string): Promise<void> {
    this.purged.push(assignmentId);
  }
}
