import { randomUUID } from 'node:crypto';
import { ticketLifetimeMs, DEFAULT_LIMITS, type IssuedTicket, type TicketKind } from '@croc-classroom/shared';
import { appError } from '../http/errors.js';
import { systemClock, type Clock } from '../ports/clock.js';
import type { TicketIssuer, TransferOutcomeHandler } from '../ports/transfers.js';

/**
 * TicketIssuer GIẢ để C test nghiệp vụ khi chưa có dịch vụ vé/worker thật của D.
 * Chỉ cấp vé và ghi lại lời gọi; không chạy croc, không lưu file. Test tự gọi
 * TransferOutcomeHandler để giả lập worker báo kết quả.
 *
 * `autoPublish()` (chế độ DEV_FAKE_TRANSFERS): sau mỗi vé gv_tai_len, tự báo "đã lưu đề" để bài
 * được phát hành mà không cần tải file — chỉ để A/B thử giao diện với server thật.
 */
export class FakeTicketIssuer implements TicketIssuer {
  readonly issued: (IssuedTicket & { request: Record<string, unknown> })[] = [];
  readonly purged: string[] = [];
  /** Đặt true để giả lập bể tiến trình VPS đã đầy. */
  full = false;
  private autoPublishTo?: { handler: Pick<TransferOutcomeHandler, 'onUploadStored'>; delayMs: number };

  constructor(private readonly clock: Clock = systemClock) {}

  autoPublish(handler: Pick<TransferOutcomeHandler, 'onUploadStored'>, delayMs = 1000): void {
    this.autoPublishTo = { handler, delayMs };
  }

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
    const ticket = this.issue('gv_tai_len', request.assignmentId, request.totalBytes, request);
    const auto = this.autoPublishTo;
    if (auto) {
      setTimeout(() => {
        void auto.handler.onUploadStored({
          ticketId: ticket.ticketId,
          assignmentId: ticket.assignmentId,
          storageRef: `fake/${ticket.assignmentId}`,
          verifiedAt: this.clock.now().toISOString(),
        });
      }, auto.delayMs);
    }
    return ticket;
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
