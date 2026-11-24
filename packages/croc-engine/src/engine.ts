import { spawn, execFile, type ChildProcess } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { lstat, readdir, mkdtemp, rename, rmdir, rm } from 'node:fs/promises';
import { progressReader } from './progress.js';
import { join, resolve } from 'node:path';
import type {
  CrocEngine,
  EngineErrorCode,
  ReceiveOptions,
  SendOptions,
  Transfer,
  TransferProgress,
  TransferResult,
} from './types.js';

class UnsafeTree extends Error {}
async function measure(dir: string): Promise<number> {
  if (!(await lstat(dir)).isDirectory()) throw new UnsafeTree();
  let bytes = 0;
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const file = join(dir, entry.name);
    if (entry.isDirectory()) bytes += await measure(file);
    else {
      const stat = await lstat(file);
      if (!stat.isFile() || stat.nlink > 1) throw new UnsafeTree();
      bytes += stat.size;
    }
  }
  return bytes;
}

function killTree(child: ChildProcess) {
  if (!child.pid || child.exitCode !== null || child.signalCode !== null) return;
  if (process.platform === 'win32') {
    execFile('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true }, (error) => {
      if (error) child.kill();
    });
  } else {
    try {
      process.kill(-child.pid, 'SIGKILL');
    } catch {
      child.kill('SIGKILL');
    }
  }
}

function run(binary: string, options: SendOptions | ReceiveOptions): Transfer {
  const sending = 'payloadDir' in options;
  const cwd = resolve(sending ? options.payloadDir : options.outDir);
  const listeners = new Set<(value: TransferProgress) => void>();
  let child: ChildProcess | undefined;
  let failure: EngineErrorCode | undefined;
  let finished = false;
  let poll: NodeJS.Timeout | undefined;
  const stop = (code: EngineErrorCode) => {
    if (finished || failure) return;
    failure = code;
    if (child) killTree(child);
  };
  const timer = setTimeout(() => stop('TIMEOUT'), Math.max(1, Math.min(options.timeoutMs, 2147483647)));
  const emit = (bytesDone: number, bytesTotal: number | null) => {
    for (const listener of listeners) listener({ bytesDone, bytesTotal });
  };
  const done = (async (): Promise<TransferResult> => {
    let lastOutput = '';
    let stage: string | undefined;
    try {
      const total = await measure(cwd);
      if (!sending && (await readdir(cwd)).length) throw new UnsafeTree();
      if (!(options.timeoutMs > 0)) stop('TIMEOUT');
      if (!failure) {
        const args = [
          '--yes',
          '--overwrite',
          '--disable-clipboard',
          '--ignore-stdin',
          '--relay',
          options.relay.address,
          '--relay6',
          '',
        ];
        if (sending) args.push('send', '--no-local', '.');
        stage = sending ? cwd : await mkdtemp(join(cwd, '.receive-'));
        if (failure) throw new Error('stopped');
        const proc = spawn(binary, args, {
          cwd: stage,
          windowsHide: true,
          detached: process.platform !== 'win32',
          env: { ...process.env, CROC_SECRET: options.code, CROC_PASS: options.relay.password },
          stdio: ['ignore', 'pipe', 'pipe'],
        });
        child = proc;
        const progress = progressReader(sending ? total : null, (p) => emit(p.bytesDone, p.bytesTotal));
        const output = (chunk: Buffer) => {
          lastOutput = (lastOutput + chunk.toString()).slice(-3000);
          progress(chunk.toString());
        };
        proc.stderr.on('data', output);
        proc.stdout.on('data', output);
        let checking = false;
        if (!sending && options.maxBytes !== undefined)
          poll = setInterval(async () => {
            if (checking || finished) return;
            checking = true;
            try {
              if ((await measure(cwd)) > options.maxBytes!) stop('SIZE_LIMIT_EXCEEDED');
            } catch (e) {
              if (e instanceof UnsafeTree) stop('PATH_ESCAPE');
            } finally {
              checking = false;
            }
          }, 250);
        const exit = await new Promise<number | null>((resolveExit) => {
          proc.once('error', (error: NodeJS.ErrnoException) => {
            failure ??= error.code === 'ENOENT' ? 'CROC_NOT_FOUND' : 'CROC_FAILED';
          });
          proc.once('close', resolveExit);
        });
        if (exit !== 0)
          failure ??= /password|authentication/i.test(lastOutput)
            ? 'RELAY_AUTH_FAILED'
            : /refused|dial tcp|no such host/i.test(lastOutput)
              ? 'RELAY_UNREACHABLE'
              : /disconnect|unexpected EOF/i.test(lastOutput)
                ? 'PEER_DISCONNECTED'
                : 'CROC_FAILED';
        if (!failure) {
          const bytes = sending ? total : await measure(cwd);
          if (!sending && options.maxBytes !== undefined && bytes > options.maxBytes)
            failure = 'SIZE_LIMIT_EXCEEDED';
          if (!sending && !failure) {
            const roots = await readdir(stage, { withFileTypes: true });
            if (roots.length !== 1 || !roots[0]?.isDirectory()) throw new UnsafeTree();
            const wrapper = join(stage, roots[0].name);
            for (const entry of await readdir(wrapper)) await rename(join(wrapper, entry), join(cwd, entry));
            await rmdir(wrapper);
            await rmdir(stage);
          }
          if (!failure) {
            emit(bytes, bytes);
            return { ok: true, bytes };
          }
        }
      }
    } catch (error) {
      failure ??= error instanceof UnsafeTree ? 'PATH_ESCAPE' : 'CROC_FAILED';
    } finally {
      finished = true;
      clearTimeout(timer);
      clearInterval(poll);
      listeners.clear();
      if (!sending && stage && failure) await rm(stage, { recursive: true, force: true }).catch(() => {});
    }
    const code = failure ?? 'CROC_FAILED';
    return { ok: false, error: { code, message: 'croc: ' + code } };
  })();
  return {
    done,
    cancel: () => stop('CANCELLED'),
    onProgress(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

/** Desktop passes its pinned binary; a container may provide CROC_BINARY or install croc on PATH. */
export function createCrocEngine(binary = process.env.CROC_BINARY || 'croc'): CrocEngine {
  return {
    generateCode: () => randomBytes(20).toString('hex'),
    send: (options) => run(binary, options),
    receive: (options) => run(binary, options),
  };
}
