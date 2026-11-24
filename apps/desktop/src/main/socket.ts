import WebSocket from 'ws';
import { networkInterfaces } from 'node:os';
import {
  WS_PATH,
  WS_SUBPROTOCOL,
  WS_CLOSE,
  ServerMessageSchema,
  type ClientMessage,
  type IpcEvents,
  type ServerMessage,
} from '@croc-classroom/shared';
import { verify } from './files.js';
import type { Jobs } from './jobs.js';

export function subnets() {
  const networks = new Set<string>();
  for (const net of Object.values(networkInterfaces()).flat()) {
    if (!net || net.internal || net.family !== 'IPv4' || !net.cidr) continue;
    const mask = net.netmask.split('.');
    const prefix = net.address
      .split('.')
      .map((v, i) => Number(v) & Number(mask[i]))
      .join('.');
    networks.add(prefix + '/' + net.cidr.split('/')[1]);
  }
  return [...networks].slice(0, 16);
}
export type Emit = <K extends keyof IpcEvents>(event: K, value: IpcEvents[K]) => void;
export class Connection {
  private socket?: WebSocket;
  private retry?: NodeJS.Timeout;
  private heartbeat?: NodeJS.Timeout;
  private tries = 0;
  private closed = false;
  private announced = new Set<string>();
  constructor(
    readonly jobs: Jobs,
    readonly emit: Emit,
    readonly revoked: (reason: 'expired' | 'revoked') => void,
    readonly lecturer: boolean,
  ) {}
  sharing(id: string) {
    return this.announced.has(id);
  }
  send(message: ClientMessage) {
    if (this.socket?.readyState !== WebSocket.OPEN) return false;
    this.socket.send(JSON.stringify(message));
    return true;
  }
  announce(id: string) {
    if (
      this.jobs.settings().seedingEnabled &&
      this.jobs.files.holdings.has(id) &&
      this.send({ type: 'seed.announce', assignmentIds: [id] })
    )
      this.announced.add(id);
  }
  withdraw(id: string) {
    this.announced.delete(id);
    this.send({ type: 'seed.withdraw', assignmentId: id });
  }
  connect() {
    if (this.closed) return;
    this.emit('connection', { server: 'connecting' });
    const url = new URL(WS_PATH, this.jobs.api.origin);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(url, WS_SUBPROTOCOL, {
      headers: { Authorization: 'Bearer ' + this.jobs.api.token },
      handshakeTimeout: 10000,
      maxPayload: 1024 * 1024,
    });
    this.socket = ws;
    let interval = 30000;
    const alive = () => {
      clearTimeout(this.heartbeat);
      this.heartbeat = setTimeout(() => ws.terminate(), interval * 3);
    };
    ws.on('open', () => {
      this.send({ type: 'hello', protocol: 1, appVersion: '0.1.0', localSubnets: subnets() });
      alive();
    });
    ws.on('ping', alive);
    ws.on('error', () => {});
    ws.on('message', (raw) => {
      let data: unknown;
      try {
        data = JSON.parse(raw.toString());
      } catch {
        return;
      }
      const parsed = ServerMessageSchema.safeParse(data);
      if (!parsed.success) return;
      if (parsed.data.type === 'welcome') interval = parsed.data.heartbeatSeconds * 1000;
      alive();
      void this.handle(parsed.data).catch(() => {});
    });
    ws.on('close', (code) => {
      clearTimeout(this.heartbeat);
      this.announced.clear();
      if (this.closed) return;
      this.emit('connection', { server: 'offline' });
      for (const { job } of this.jobs.running.values()) if (job.kind === 'seed') this.jobs.cancel(job.id);
      if (code === WS_CLOSE.unauthenticated || code === WS_CLOSE.revoked) {
        this.revoked(code === WS_CLOSE.revoked ? 'revoked' : 'expired');
        return;
      }
      this.retry = setTimeout(
        () => this.connect(),
        Math.min(30000, 1000 * 2 ** this.tries++) + Math.random() * 250,
      );
    });
  }
  stop() {
    this.closed = true;
    clearTimeout(this.retry);
    clearTimeout(this.heartbeat);
    this.socket?.terminate();
  }
  private async handle(m: ServerMessage) {
    const jobs = this.jobs;
    switch (m.type) {
      case 'welcome':
        this.tries = 0;
        this.emit('connection', { server: 'online' });
        for (const id of jobs.files.holdings.keys()) this.announce(id);
        await jobs.reconcile();
        if (this.lecturer) await jobs.collect();
        break;
      case 'serve.request': {
        const id = m.assignmentId;
        const manifest = jobs.files.holdings.get(id);
        const busy = [...jobs.running.values()].filter((x) => x.job.kind === 'seed').length;
        if (!manifest || !jobs.settings().seedingEnabled || busy >= jobs.settings().seedingConcurrency) {
          this.send({
            type: 'serve.reject',
            ticketId: m.ticketId,
            reason: !manifest
              ? 'not_in_cache'
              : !jobs.settings().seedingEnabled
                ? 'sharing_disabled'
                : 'busy',
          });
          break;
        }
        this.send({ type: 'serve.accept', ticketId: m.ticketId });
        jobs.start('seed', id, async (job) => {
          const ticket = {
            ...m,
            kind: 'phat_de' as const,
            totalBytes: manifest.files.reduce((n, f) => n + f.size, 0),
          };
          job.ticket = ticket;
          try {
            await verify(jobs.files.cache(id), manifest);
            await jobs.move(job, ticket, jobs.files.cache(id), true);
            this.send({ type: 'serve.result', ticketId: m.ticketId, ok: true });
          } catch (e) {
            this.send({
              type: 'serve.result',
              ticketId: m.ticketId,
              ok: false,
              reason: job.signal.aborted ? 'cancelled' : 'internal',
            });
            throw e;
          }
        });
        break;
      }
      case 'queue.position':
        for (const { job } of jobs.running.values())
          if (job.kind === 'fetch' && jobs.queued.has(m.assignmentId) && job.assignmentId === m.assignmentId)
            job.update('queued', { queuePosition: m.position });
        break;
      case 'ticket.ready':
        if (jobs.queued.has(m.ticket.assignmentId)) jobs.ready.set(m.ticket.assignmentId, m.ticket);
        break;
      case 'ticket.cancel':
        for (const { job } of jobs.running.values())
          if (job.ticket?.ticketId === m.ticketId) jobs.cancel(job.id);
        break;
      case 'assignment.deleted':
        for (const { job } of jobs.running.values())
          if (job.assignmentId === m.assignmentId) jobs.cancel(job.id);
        this.withdraw(m.assignmentId);
        await jobs.files.clear(m.assignmentId);
        this.emit('assignment', { assignmentId: m.assignmentId, change: 'deleted' });
        break;
      case 'assignment.published':
        this.emit('assignment', { assignmentId: m.assignmentId, change: 'published' });
        break;
      case 'submission.new':
        this.emit('assignment', { assignmentId: m.assignmentId, change: 'submission_new' });
        await jobs.collect(m.assignmentId);
        break;
      case 'seed.rejected':
        this.announced.delete(m.assignmentId);
        break;
    }
  }
}
