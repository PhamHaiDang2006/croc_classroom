import { randomBytes } from 'node:crypto';
import { cp, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type {
  CrocEngine,
  EngineError,
  ReceiveOptions,
  SendOptions,
  Transfer,
  TransferProgress,
  TransferResult,
} from '../types.js';

/**
 * Engine GIẢ cho test: ghép send/receive cùng code trong cùng tiến trình Node và chép file trực tiếp.
 * Mô phỏng các hành vi quan trọng của croc theo system-design mục 3:
 * - mỗi code chỉ ghép 1 người gửi ↔ 1 người nhận; người nhận thứ hai cùng code chờ đến hết timeout;
 * - timeout, cancel, giới hạn dung lượng nhận.
 * KHÔNG dùng để kết luận truyền file thật hoạt động.
 */

interface Pending {
  side: 'send' | 'receive';
  options: SendOptions | ReceiveOptions;
  finish: (result: TransferResult) => void;
  emit: (progress: TransferProgress) => void;
  /** Bên kia sau khi đã ghép đôi. */
  partner?: Pending;
}

async function directorySize(dir: string): Promise<number> {
  let total = 0;
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) total += await directorySize(full);
    else if (entry.isFile()) total += (await stat(full)).size;
  }
  return total;
}

export interface LoopbackEngine extends CrocEngine {
  /** Số lượt đang chờ ghép đôi. */
  pendingCount(): number;
}

export function createLoopbackEngine(): LoopbackEngine {
  const waiting = new Map<string, Pending>();
  /** Code đã được ghép đôi: người đến sau sẽ treo đến timeout như croc thật. */
  const used = new Set<string>();

  function start(side: 'send' | 'receive', options: SendOptions | ReceiveOptions): Transfer {
    const listeners = new Set<(p: TransferProgress) => void>();
    let settled = false;
    let resolveDone!: (r: TransferResult) => void;
    const done = new Promise<TransferResult>((resolve) => (resolveDone = resolve));

    const self: Pending = {
      side,
      options,
      emit: (p) => listeners.forEach((l) => l(p)),
      finish: (result) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (waiting.get(options.code) === self) waiting.delete(options.code);
        resolveDone(result);
        // Một bên dừng giữa chừng thì bên kia mất kết nối, như croc thật.
        if (!result.ok) self.partner?.finish({ ok: false, error: { code: 'PEER_DISCONNECTED', message: 'Bên kia đã dừng' } });
      },
    };
    const fail = (error: EngineError) => self.finish({ ok: false, error });
    const timer = setTimeout(() => fail({ code: 'TIMEOUT', message: 'Hết thời gian chờ' }), options.timeoutMs);

    const peer = waiting.get(options.code);
    if (used.has(options.code) || (peer && peer.side === side)) {
      // Giống croc: không ghép được thì treo đến timeout, không báo lỗi riêng.
    } else if (peer) {
      waiting.delete(options.code);
      used.add(options.code);
      const sender = side === 'send' ? self : peer;
      const receiver = side === 'receive' ? self : peer;
      sender.partner = receiver;
      receiver.partner = sender;
      void pair(sender, receiver);
    } else {
      waiting.set(options.code, self);
    }

    return {
      done,
      onProgress(listener) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      cancel() {
        fail({ code: 'CANCELLED', message: 'Đã huỷ' });
      },
    };
  }

  async function pair(sender: Pending, receiver: Pending): Promise<void> {
    const sendOptions = sender.options as SendOptions;
    const receiveOptions = receiver.options as ReceiveOptions;
    try {
      const bytes = await directorySize(sendOptions.payloadDir);
      if (receiveOptions.maxBytes !== undefined && bytes > receiveOptions.maxBytes) {
        receiver.finish({ ok: false, error: { code: 'SIZE_LIMIT_EXCEEDED', message: 'Vượt dung lượng cho phép' } });
        return;
      }
      const start = { bytesDone: 0, bytesTotal: bytes };
      sender.emit(start);
      receiver.emit(start);
      await cp(sendOptions.payloadDir, receiveOptions.outDir, { recursive: true, errorOnExist: false, force: true });
      const end = { bytesDone: bytes, bytesTotal: bytes };
      sender.emit(end);
      receiver.emit(end);
      sender.finish({ ok: true, bytes });
      receiver.finish({ ok: true, bytes });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      receiver.finish({ ok: false, error: { code: 'CROC_FAILED', message } });
    }
  }

  return {
    send: (options) => start('send', options),
    receive: (options) => start('receive', options),
    generateCode: () => `loopback-${randomBytes(16).toString('hex')}`,
    pendingCount: () => waiting.size,
  };
}
