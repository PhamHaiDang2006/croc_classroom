import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'node:http';
import {
  ClientMessageSchema,
  WS_CLOSE,
  WS_PATH,
  WS_SUBPROTOCOL,
  type ClientMessage,
  type ServerMessage,
  type IssuedTicket,
} from '@croc-classroom/shared';
import type { Db } from '../db/index.js';
import type { AuthContext, SessionResolver } from '../ports/sessions.js';

/** Một kết nối WebSocket của app (một phiên đăng nhập). */
export interface Peer {
  auth: AuthContext;
  socket: WebSocket;
  /** IP công khai (sau reverse proxy được tin). */
  ip: string;
  /** Subnet LAN app báo trong `hello`. */
  subnets: string[];
  /** Các bài app đang sẵn sàng phát lại (seed.announce đã được chấp nhận). */
  sharing: Set<string>;
  busy: number;
  lastUsed: number;
  hello: boolean;
  alive: boolean;
}
type ServeReply = Extract<ClientMessage, { type: 'serve.result' | 'serve.reject' | 'serve.accept' }>;

const HEARTBEAT_SECONDS = 15;
/** Đóng kết nối sau từng này thông điệp sai liên tiếp. */
const MAX_INVALID_MESSAGES = 3;

export class Peers {
  readonly online = new Set<Peer>();
  /** Lời mời phát đề đang chờ seeder trả lời, theo ticketId. */
  readonly offers = new Map<string, { peer: Peer; answer: (accepted: boolean) => void }>();
  readonly wss = new WebSocketServer({
    noServer: true,
    maxPayload: 65536,
    handleProtocols: (p) => (p.has(WS_SUBPROTOCOL) ? WS_SUBPROTOCOL : false),
  });
  onResult: (peer: Peer, m: Extract<ServeReply, { type: 'serve.result' }>) => void = () => {};
  onDisconnect: (peer: Peer) => void = () => {};
  private heartbeat?: NodeJS.Timeout;

  constructor(readonly db: Db) {}

  /** Phiên còn hạn và tài khoản không bị vô hiệu hoá. */
  valid(peer: Peer) {
    return !!this.db
      .prepare('SELECT 1 FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.id=? AND s.expires_at>? AND u.disabled=0')
      .get(peer.auth.sessionId, new Date().toISOString());
  }

  send(peer: Peer, msg: ServerMessage) {
    if (peer.socket.readyState !== WebSocket.OPEN || !this.valid(peer)) return false;
    peer.socket.send(JSON.stringify(msg));
    return true;
  }

  notify(user: string, msg: ServerMessage) {
    for (const peer of this.online) if (peer.auth.userId === user && peer.hello) this.send(peer, msg);
  }

  available(id: string) {
    return [...this.online].filter((p) => p.sharing.has(id) && this.valid(p));
  }

  /** Mời seeder phát vé; resolve true nếu seeder chấp nhận trong `ms`. */
  offer(peer: Peer, ticket: IssuedTicket, ms: number) {
    return new Promise<boolean>((resolve) => {
      const answer = (ok: boolean) => {
        clearTimeout(timer);
        this.offers.delete(ticket.ticketId);
        resolve(ok);
      };
      const timer = setTimeout(() => answer(false), ms);
      this.offers.set(ticket.ticketId, { peer, answer });
      const { assignmentId, ticketId, crocCode, expiresAt } = ticket;
      if (!this.send(peer, { type: 'serve.request', assignmentId, ticketId, crocCode, expiresAt })) answer(false);
    });
  }

  attach(server: Server, sessions: SessionResolver, trusted: string[] | false) {
    server.on('upgrade', (req, socket, head) => {
      socket.on('error', () => socket.destroy());
      const token = /^Bearer ([^\s]+)$/i.exec(req.headers.authorization ?? '')?.[1];
      if (req.url !== WS_PATH || !token || req.headers['sec-websocket-protocol'] !== WS_SUBPROTOCOL) {
        socket.destroy();
        return;
      }
      void sessions
        .resolve(token)
        .then((result) => {
          if (!result.ok || socket.destroyed) {
            socket.destroy();
            return;
          }
          this.wss.handleUpgrade(req, socket, head, (ws) => {
            let ip = (req.socket.remoteAddress ?? '').replace(/^::ffff:/, '');
            // Sau reverse proxy được tin: lấy IP client do proxy thêm vào cuối X-Forwarded-For.
            if (trusted && trusted.includes(ip))
              ip = String(req.headers['x-forwarded-for'] ?? '').split(',').at(-1)?.trim() ?? '';
            this.connect({ auth: result.auth, socket: ws, ip, subnets: [], sharing: new Set(), busy: 0, lastUsed: 0, hello: false, alive: true });
          });
        })
        .catch(() => socket.destroy());
    });
    this.heartbeat = setInterval(() => {
      for (const p of this.online) {
        if (!this.valid(p)) p.socket.close(WS_CLOSE.revoked);
        else if (!p.alive) p.socket.terminate();
        else {
          p.alive = false;
          p.socket.ping();
        }
      }
    }, HEARTBEAT_SECONDS * 1000);
  }

  private connect(peer: Peer) {
    const ws = peer.socket;
    this.online.add(peer);
    ws.on('error', () => ws.terminate());
    ws.on('pong', () => {
      peer.alive = true;
    });
    let invalid = 0;
    ws.on('message', (raw) => {
      if (!this.valid(peer)) {
        ws.close(WS_CLOSE.revoked);
        return;
      }
      try {
        const m = ClientMessageSchema.parse(JSON.parse(raw.toString()));
        if (!peer.hello && m.type !== 'hello') throw new Error();
        this.message(peer, m);
      } catch {
        this.send(peer, { type: 'error', code: 'bad_message', message: 'Thông điệp không hợp lệ.' });
        if (++invalid >= MAX_INVALID_MESSAGES) ws.close(WS_CLOSE.badMessage);
      }
    });
    ws.on('close', () => {
      this.online.delete(peer);
      for (const offer of this.offers.values()) if (offer.peer === peer) offer.answer(false);
      this.onDisconnect(peer);
    });
  }

  private message(p: Peer, m: ClientMessage) {
    switch (m.type) {
      case 'hello':
        p.hello = true;
        p.subnets = m.localSubnets;
        this.send(p, { type: 'welcome', userId: p.auth.userId, serverTime: new Date().toISOString(), heartbeatSeconds: HEARTBEAT_SECONDS });
        break;
      case 'seed.announce':
        for (const id of m.assignmentIds) {
          const row = this.db.prepare('SELECT banned FROM holdings WHERE assignment_id=? AND user_id=?').get(id, p.auth.userId) as
            | { banned: number }
            | undefined;
          if (row && !row.banned) p.sharing.add(id);
          else this.send(p, { type: 'seed.rejected', assignmentId: id, reason: row ? 'banned' : 'not_holder' });
        }
        break;
      case 'seed.withdraw':
        p.sharing.delete(m.assignmentId);
        break;
      case 'serve.accept':
      case 'serve.reject': {
        const offer = this.offers.get(m.ticketId);
        if (offer?.peer === p) offer.answer(m.type === 'serve.accept');
        break;
      }
      case 'serve.result':
        this.onResult(p, m);
        break;
    }
  }

  close() {
    clearInterval(this.heartbeat);
    for (const p of this.online) p.socket.terminate();
    this.wss.close();
  }
}
