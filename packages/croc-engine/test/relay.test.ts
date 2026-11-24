import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { expect, it } from 'vitest';
import { createCrocEngine } from '../src/engine.js';

const binary = resolve(
  'packages/croc-engine/bin',
  process.platform + '-' + process.arch,
  process.platform === 'win32' ? 'croc.exe' : 'croc',
);
it.skipIf(!existsSync(binary))(
  'pinned relay transfers nested Unicode files, cancels and times out',
  async () => {
    const root = await mkdtemp(join(tmpdir(), 'croc-engine-'));
    const payloadDir = join(root, 'source');
    const outDir = join(root, 'output');
    const relay = { address: '127.0.0.1:29871', password: randomBytes(20).toString('hex') };
    const server = spawn(binary, ['relay', '--host', '127.0.0.1', '--ports', '29871,29872'], {
      stdio: 'ignore',
      windowsHide: true,
      env: { ...process.env, CROC_PASS: relay.password },
    });
    const closed = new Promise<void>((resolve) => server.once('close', () => resolve()));
    const engine = createCrocEngine(binary);
    try {
      await mkdir(join(payloadDir, 'bài tập'), { recursive: true });
      await mkdir(outDir);
      await writeFile(join(payloadDir, 'bài tập', 'đề.txt'), 'hello');
      const options = { relay, code: engine.generateCode(), timeoutMs: 10000 };
      await delay(500);
      const send = engine.send({ ...options, payloadDir });
      await delay(250);
      const receive = engine.receive({ ...options, outDir, maxBytes: 5 });
      expect(await Promise.all([send.done, receive.done])).toEqual([
        { ok: true, bytes: 5 },
        { ok: true, bytes: 5 },
      ]);
      expect(await readFile(join(outDir, 'bài tập', 'đề.txt'), 'utf8')).toBe('hello');
      const empty = join(root, 'empty');
      await mkdir(empty);
      const second = engine.receive({ ...options, outDir: empty, timeoutMs: 500 });
      expect(await second.done).toMatchObject({ ok: false, error: { code: 'TIMEOUT' } });
      const pending = engine.receive({ ...options, outDir: empty });
      await delay(200);
      pending.cancel();
      pending.cancel();
      expect(await pending.done).toMatchObject({ ok: false, error: { code: 'CANCELLED' } });
    } finally {
      server.kill();
      await closed;
      await rm(root, { recursive: true, force: true });
    }
  },
  20000,
);
