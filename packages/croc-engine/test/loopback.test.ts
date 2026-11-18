import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { computeManifest, verifyDirectory } from '@croc-classroom/shared/node';
import { createLoopbackEngine } from '@croc-classroom/croc-engine/testing';

const relay = { address: 'localhost:9009', password: 'khong-dung' };
let work: string;
let payload: string;

beforeEach(async () => {
  work = await mkdtemp(join(tmpdir(), 'croc-loopback-'));
  payload = join(work, 'payload');
  await mkdir(join(payload, 'thư mục'), { recursive: true });
  await writeFile(join(payload, 'Đề bài.txt'), 'nội dung đề');
  await writeFile(join(payload, 'thư mục', 'dữ liệu.csv'), 'a,b\n1,2\n');
});
afterEach(async () => {
  await rm(work, { recursive: true, force: true });
});

describe('loopback engine (GIẢ — không chạy croc)', () => {
  it('gửi và nhận cùng code: file nằm ngay dưới outDir, khớp manifest', async () => {
    const engine = createLoopbackEngine();
    const code = engine.generateCode();
    const outDir = join(work, 'nhan');
    const progress: number[] = [];

    const sender = engine.send({ payloadDir: payload, code, relay, timeoutMs: 1000 });
    const receiver = engine.receive({ code, outDir, relay, timeoutMs: 1000 });
    receiver.onProgress((p) => progress.push(p.bytesDone));

    const [sent, received] = await Promise.all([sender.done, receiver.done]);
    expect(sent).toMatchObject({ ok: true });
    expect(received).toMatchObject({ ok: true });
    expect(progress.at(-1)).toBeGreaterThan(0);
    expect(await verifyDirectory(outDir, await computeManifest(payload))).toEqual({ ok: true });
  });

  it('người nhận thứ hai cùng code treo đến hết giờ (như croc)', async () => {
    const engine = createLoopbackEngine();
    const code = engine.generateCode();
    engine.send({ payloadDir: payload, code, relay, timeoutMs: 1000 });
    await engine.receive({ code, outDir: join(work, 'a'), relay, timeoutMs: 1000 }).done;

    const second = await engine.receive({ code, outDir: join(work, 'b'), relay, timeoutMs: 30 }).done;
    expect(second).toEqual({ ok: false, error: { code: 'TIMEOUT', message: expect.any(String) } });
  });

  it('huỷ lượt đang chờ thì không còn treo trong bộ ghép đôi', async () => {
    const engine = createLoopbackEngine();
    const transfer = engine.send({ payloadDir: payload, code: engine.generateCode(), relay, timeoutMs: 1000 });
    expect(engine.pendingCount()).toBe(1);
    transfer.cancel();
    transfer.cancel();
    expect(await transfer.done).toEqual({ ok: false, error: { code: 'CANCELLED', message: expect.any(String) } });
    expect(engine.pendingCount()).toBe(0);
  });

  it('dừng khi vượt dung lượng nhận cho phép; bên gửi mất kết nối', async () => {
    const engine = createLoopbackEngine();
    const code = engine.generateCode();
    const sender = engine.send({ payloadDir: payload, code, relay, timeoutMs: 1000 });
    const receiver = engine.receive({ code, outDir: join(work, 'nhan'), relay, timeoutMs: 1000, maxBytes: 5 });
    expect(await receiver.done).toMatchObject({ ok: false, error: { code: 'SIZE_LIMIT_EXCEEDED' } });
    expect(await sender.done).toMatchObject({ ok: false, error: { code: 'PEER_DISCONNECTED' } });
  });

  it('sinh code khác nhau, đủ dài', () => {
    const engine = createLoopbackEngine();
    const codes = new Set(Array.from({ length: 100 }, () => engine.generateCode()));
    expect(codes.size).toBe(100);
    for (const code of codes) expect(code.length).toBeGreaterThanOrEqual(32);
  });
});
