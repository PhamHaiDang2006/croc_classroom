import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import type { CrocEngine, Transfer } from '@croc-classroom/croc-engine';
import {
  isTerminalTicketStatus,
  type AppSettings,
  type ClientConfig,
  type IssuedTicket,
  type Manifest,
  type StudentRef,
  type TransferEvent,
  type Receipt,
  type TransferFailureReason,
} from '@croc-classroom/shared';
import { Folders } from './folders.js';
import { type LocalFiles, verify, writeAtomic } from './files.js';
import { ClientError, publicError, type RestClient } from './rest.js';

interface Job {
  id: string;
  assignmentId: string;
  kind: TransferEvent['kind'];
  signal: AbortSignal;
  update: (phase: TransferEvent['phase'], more?: Partial<TransferEvent>) => void;
  ticket?: IssuedTicket;
  transfer?: Transfer;
}
type Runner = (job: Job) => Promise<Receipt | void>;
export class Jobs {
  readonly running = new Map<string, { job: Job; abort: AbortController; done: Promise<void> }>();
  readonly ready = new Map<string, IssuedTicket>();
  readonly queued = new Set<string>();
  constructor(
    readonly api: RestClient,
    readonly engine: CrocEngine,
    readonly files: LocalFiles,
    readonly config: ClientConfig,
    readonly settings: () => AppSettings,
    readonly emit: (event: TransferEvent) => void,
    readonly onCache: (id: string) => void,
    readonly subnets: () => string[],
  ) {
    this.folders = new Folders(files.root);
  }
  readonly folders: Folders;
  work(id: string) {
    return this.folders.locate(this.settings().workDir, id);
  }
  collected(id: string) {
    return this.folders.locate(this.settings().collectDir, id);
  }
  async version(id: string, student: StudentRef) {
    const dir = await this.collected(id);
    return dir ? this.folders.version(dir, student) : null;
  }
  start(kind: Job['kind'], assignmentId: string, runner: Runner) {
    const id = randomUUID();
    const abort = new AbortController();
    const update: Job['update'] = (phase, fields) =>
      this.emit({
        operationId: id,
        assignmentId,
        kind,
        phase,
        bytesDone: 0,
        bytesTotal: job.ticket?.totalBytes ?? 0,
        at: new Date().toISOString(),
        ...fields,
      });
    const job: Job = { id, assignmentId, kind, signal: abort.signal, update };
    const done = Promise.resolve()
      .then(async () => {
        update('preparing');
        try {
          const receipt = await runner(job);
          abort.signal.throwIfAborted();
          update('succeeded', { bytesDone: job.ticket?.totalBytes ?? 0, ...(receipt ? { receipt } : {}) });
        } catch (error) {
          const reason: TransferFailureReason = abort.signal.aborted
            ? 'cancelled'
            : error instanceof TransferFailure
              ? error.reason
              : error instanceof ClientError && error.code === 'MANIFEST_INVALID'
                ? 'verify_failed'
                : 'internal';
          if (job.ticket && kind !== 'seed')
            await this.api
              .call('ticketResult', job.ticket.ticketId, { outcome: 'failed', reason })
              .catch(() => {});
          update(reason === 'cancelled' ? 'cancelled' : reason === 'timeout' ? 'timeout' : 'failed', {
            error: publicError(error),
          });
        }
      })
      .finally(() => {
        this.running.delete(id);
      });
    this.running.set(id, { job, abort, done });
    return { operationId: id };
  }
  cancel(id: string) {
    const item = this.running.get(id);
    item?.abort.abort();
    item?.job.transfer?.cancel();
  }
  async stop() {
    this.stopCollectRetries();
    for (const id of this.running.keys()) this.cancel(id);
    await Promise.all([...this.running.values()].map((x) => x.done));
  }
  async reconcile() {
    for (const id of this.queued) {
      if (this.ready.has(id)) continue;
      const issued = await this.api.call('fetch', id, { localSubnets: this.subnets() });
      if (this.queued.has(id) && issued.status === 'ticket') this.ready.set(id, issued.ticket);
    }
    for (const { job } of this.running.values()) {
      if (!job.ticket) continue;
      const info = await this.api.call('getTicket', job.ticket.ticketId);
      if (['huy', 'het_han', 'loi'].includes(info.status)) this.cancel(job.id);
    }
  }
  async move(job: Job, ticket: IssuedTicket, dir: string, send: boolean) {
    if (ticket.assignmentId !== job.assignmentId) throw new TransferFailure('internal');
    job.ticket = ticket;
    job.signal.throwIfAborted();
    const options = {
      relay: this.config.relay,
      code: ticket.crocCode,
      // expiresAt theo giờ server: so với giờ server ước lượng, không so với đồng hồ máy.
      timeoutMs: Date.parse(ticket.expiresAt) - this.api.serverNow(),
    };
    const transfer = send
      ? this.engine.send({ ...options, payloadDir: dir })
      : this.engine.receive({ ...options, outDir: dir, maxBytes: ticket.totalBytes });
    job.transfer = transfer;
    job.update('transferring');
    const unsub = transfer.onProgress((p) => job.update('transferring', { bytesDone: p.bytesDone }));
    const result = await transfer.done;
    unsub();
    job.signal.throwIfAborted();
    if (!result.ok) {
      const reasons = {
        TIMEOUT: 'timeout',
        CANCELLED: 'cancelled',
        PEER_DISCONNECTED: 'peer_disconnected',
        RELAY_UNREACHABLE: 'relay_unreachable',
        RELAY_AUTH_FAILED: 'relay_auth_failed',
        SIZE_LIMIT_EXCEEDED: 'size_exceeded',
        PATH_ESCAPE: 'verify_failed',
        CROC_NOT_FOUND: 'internal',
        CROC_FAILED: 'internal',
      } as const;
      throw new TransferFailure(reasons[result.error.code]);
    }
  }
  async confirm(job: Job, ticket: IssuedTicket) {
    job.signal.throwIfAborted();
    let info = await this.api.call('ticketResult', ticket.ticketId, { outcome: 'succeeded' });
    while (!isTerminalTicketStatus(info.status)) {
      if (this.api.serverNow() >= Date.parse(ticket.expiresAt)) throw new TransferFailure('timeout');
      await delay(800, undefined, { signal: job.signal });
      info = await this.api.call('getTicket', ticket.ticketId);
    }
    if (
      info.ticketId !== ticket.ticketId ||
      info.assignmentId !== ticket.assignmentId ||
      info.kind !== ticket.kind ||
      info.status !== 'xong' ||
      (job.kind === 'submit' && info.receipt?.assignmentId !== ticket.assignmentId)
    )
      throw new TransferFailure(info.failureReason ?? 'internal');
    return info.receipt ?? undefined;
  }
  upload(ticket: IssuedTicket, dir: string, manifest: Manifest) {
    return this.start('upload', ticket.assignmentId, async (job) => {
      await this.move(job, ticket, dir, true);
      await this.confirm(job, ticket);
      await this.files.keep(ticket.assignmentId, dir, manifest);
      this.onCache(ticket.assignmentId);
    });
  }
  submit(ticket: IssuedTicket, dir: string) {
    return this.start('submit', ticket.assignmentId, async (job) => {
      await this.move(job, ticket, dir, true);
      job.update('verifying');
      const receipt = await this.confirm(job, ticket);
      if (receipt)
        await writeAtomic(join(this.files.root, 'receipts', ticket.assignmentId), JSON.stringify(receipt));
      return receipt;
    });
  }
  fetch(id: string, manifest: Manifest, title: string) {
    if (
      this.queued.has(id) ||
      [...this.running.values()].some((x) => x.job.kind === 'fetch' && x.job.assignmentId === id)
    )
      throw new ClientError('BUSY', 'Đang nhận đề này.');
    return this.start('fetch', id, async (job) => {
      for (let attempt = 0; ; attempt++) {
        const dir = await mkdtemp(join(this.files.temp, 'fetch-'));
        try {
          this.queued.add(id);
          const issued = await this.api.call('fetch', id, { localSubnets: this.subnets() });
          let ticket: IssuedTicket;
          if (issued.status === 'queued') {
            job.update('queued', { queuePosition: issued.position });
            while (!this.ready.has(id)) await delay(200, undefined, { signal: job.signal });
            ticket = this.ready.get(id)!;
          } else ticket = issued.ticket;
          this.queued.delete(id);
          await this.move(job, ticket, dir, false);
          job.update('verifying');
          await verify(dir, manifest);
          await this.folders.installWork(this.settings().workDir, id, title, dir, manifest);
          await this.files.keep(id, dir, manifest);
          await this.confirm(job, ticket);
          this.onCache(id);
          return;
        } catch (error) {
          if (
            attempt ||
            job.signal.aborted ||
            !(
              error instanceof TransferFailure ||
              (error instanceof ClientError && error.code === 'MANIFEST_INVALID')
            )
          )
            throw error;
          if (job.ticket)
            await this.api
              .call('ticketResult', job.ticket.ticketId, {
                outcome: 'failed',
                reason: error instanceof TransferFailure ? error.reason : 'verify_failed',
              })
              .catch(() => {});
          job.ticket = undefined;
        } finally {
          if (this.queued.delete(id)) await this.api.call('leaveFetchQueue', id).catch(() => {});
          this.ready.delete(id);
          await rm(dir, { recursive: true, force: true });
        }
      }
    });
  }
  private collecting = new Set<string>();
  private collectAgain = new Set<string>();
  private collectRetry = new Map<string, NodeJS.Timeout>();
  /** Chờ trước khi thu lại bài bị bỏ qua vì VPS hết chỗ (CAPACITY_EXHAUSTED). Test được rút ngắn. */
  collectRetryMs = 5000;
  /** Huỷ các lượt hẹn thu lại (đăng xuất / đóng app). */
  stopCollectRetries() {
    for (const timer of this.collectRetry.values()) clearTimeout(timer);
    this.collectRetry.clear();
  }
  private scheduleCollect(assignmentId: string) {
    if (this.collectRetry.has(assignmentId) || this.api.signal?.aborted) return;
    const timer = setTimeout(() => {
      this.collectRetry.delete(assignmentId);
      if (!this.api.signal?.aborted) void this.collect(assignmentId).catch(() => {});
    }, this.collectRetryMs);
    timer.unref?.();
    this.collectRetry.set(assignmentId, timer);
  }
  /**
   * Thu bản nộp mới nhất của từng SV. Lỗi ở một SV (VPS hết chỗ, bản vừa bị thay, bài vừa bị xoá…)
   * không được chặn các SV và các bài còn lại; VPS hết chỗ thì hẹn thu lại bài đó.
   */
  async collect(id?: string) {
    const ids = id ? [id] : (await this.api.call('listAssignments')).assignments.map((x) => x.id);
    for (const assignmentId of ids) {
      if (this.collecting.has(assignmentId)) {
        this.collectAgain.add(assignmentId);
        continue;
      }
      this.collecting.add(assignmentId);
      let retry = false;
      try {
        const stop = (error: unknown) =>
          this.api.signal?.aborted || (error instanceof ClientError && error.code === 'OFFLINE');
        // Bài vừa bị xoá (NOT_FOUND)…: bỏ qua bài này, thu tiếp các bài khác.
        const rows = await this.api.call('listSubmissions', assignmentId).then(
          (r) => r.rows,
          (error: unknown) => {
            if (stop(error)) throw error;
            return [];
          },
        );
        for (const row of rows) {
          if (!row.latest || (await this.version(assignmentId, row.student)) === row.latest.version) continue;
          let opened;
          try {
            opened = await this.api.call('collect', row.latest.submissionId);
          } catch (error) {
            // Mất mạng / đăng xuất: dừng cả lượt, kết nối lại sẽ thu tiếp. Lỗi khác: bỏ qua SV này.
            if (stop(error)) throw error;
            if (error instanceof ClientError && error.code === 'CAPACITY_EXHAUSTED') retry = true;
            continue;
          }
          const { submission, ticket } = opened;
          const { operationId } = this.start('collect', assignmentId, async (job) => {
            const dir = await mkdtemp(join(this.files.temp, 'collect-'));
            try {
              await this.move(job, ticket, dir, false);
              job.update('verifying');
              await verify(dir, submission.manifest);
              const detail = await this.api.call('getAssignment', assignmentId);
              const base = await this.folders.reserve(this.settings().collectDir, assignmentId, detail.title);
              await this.folders.replace(base, row.student, dir, submission.manifest);
              await this.confirm(job, ticket);
              await this.folders.markVersion(base, row.student, submission.version);
            } finally {
              await rm(dir, { recursive: true, force: true });
            }
          });
          await this.running.get(operationId)?.done;
        }
      } finally {
        this.collecting.delete(assignmentId);
      }
      if (retry) this.scheduleCollect(assignmentId);
      if (this.collectAgain.delete(assignmentId) && !this.api.signal?.aborted)
        await this.collect(assignmentId);
    }
  }
}
class TransferFailure extends ClientError {
  constructor(readonly reason: TransferFailureReason) {
    super(reason === 'cancelled' ? 'CANCELLED' : 'INTERNAL', 'Lượt truyền thất bại (' + reason + ').');
  }
}
