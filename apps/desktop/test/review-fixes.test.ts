import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { createLoopbackEngine } from '@croc-classroom/croc-engine/testing';
import type { CrocEngine } from '@croc-classroom/croc-engine';
import type { TransferEvent } from '@croc-classroom/shared';
import {
  fixtureClientConfig,
  fixtureIds,
  fixtureIssuedTicket,
  fixtureSubmissionRows,
  fixtureTicketInfo,
} from '@croc-classroom/shared/fixtures';
import { computeManifest } from '@croc-classroom/shared/node';
import { Jobs } from '../src/main/jobs.js';
import { LocalFiles } from '../src/main/files.js';
import { ClientError, RestClient } from '../src/main/rest.js';

// Hồi quy cho review toàn bộ A-Frontend (2026-11-28): lệch giờ máy khách và tự thu bài dừng giữa chừng.

const roots: string[] = [];
afterEach(async () => {
  vi.unstubAllGlobals();
  for (const dir of roots.splice(0)) await rm(dir, { recursive: true, force: true });
});
async function tempRoot() {
  const dir = await mkdtemp(join(tmpdir(), 'classroom-review-'));
  roots.push(dir);
  return dir;
}
function makeJobs(api: RestClient, engine: CrocEngine, root: string, events: TransferEvent[] = []) {
  return new Jobs(
    api,
    engine,
    new LocalFiles(root, root),
    fixtureClientConfig,
    () => ({ serverUrl: api.origin, workDir: root, collectDir: join(root, 'collected'), seedingEnabled: true, seedingConcurrency: 1 }),
    (e) => events.push(e),
    () => {},
    () => [],
  );
}

it('RestClient ước lượng giờ server từ header Date', async () => {
  const serverTime = Date.now() - 3_600_000;
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      Response.json(
        { status: 'ok', contractVersion: 1, serverTime: new Date(serverTime).toISOString() },
        { headers: { date: new Date(serverTime).toUTCString() } },
      ),
    ),
  );
  const api = new RestClient('http://localhost');
  await api.call('health');
  expect(Math.abs(api.serverNow() - serverTime)).toBeLessThan(2000);
});

it('đồng hồ máy chạy nhanh 3 phút vẫn nộp được: hạn vé so với giờ server', async () => {
  const root = await tempRoot();
  const api = new RestClient('http://localhost');
  api.syncClock(Date.now() - 180_000);
  const engine = createLoopbackEngine();
  const events: TransferEvent[] = [];
  const jobs = makeJobs(api, engine, root, events);
  const ticket = {
    ...fixtureIssuedTicket,
    kind: 'nop_bai' as const,
    ticketId: fixtureTicketInfo.ticketId,
    crocCode: engine.generateCode(),
    // Vé còn 10 giây theo giờ server, nhưng đã "hết hạn" 170 giây theo đồng hồ máy.
    expiresAt: new Date(api.serverNow() + 10_000).toISOString(),
  };
  vi.spyOn(api, 'call').mockResolvedValue(fixtureTicketInfo);
  const input = join(root, 'input'),
    output = join(root, 'output');
  await mkdir(input);
  await mkdir(output);
  await writeFile(join(input, 'answer'), 'payload');
  const receiver = engine.receive({ relay: fixtureClientConfig.relay, code: ticket.crocCode, outDir: output, timeoutMs: 10_000 });
  const { operationId } = jobs.submit(ticket, input);
  await jobs.running.get(operationId)!.done;
  expect(events.at(-1)?.phase).toBe('succeeded');
  expect((await receiver.done).ok).toBe(true);
  await jobs.stop();
});

it('tự thu bài: một SV lỗi không chặn SV khác, VPS hết chỗ thì hẹn thu lại', async () => {
  const root = await tempRoot();
  const api = new RestClient('http://localhost');
  const engine = createLoopbackEngine();
  const jobs = makeJobs(api, engine, root);
  jobs.collectRetryMs = 20;

  const assignmentId = fixtureIds.assignmentPublished;
  const [an] = fixtureSubmissionRows;
  const blocked = { ...an!, latest: { ...an!.latest!, submissionId: crypto.randomUUID(), version: 1 } };
  const binh = {
    ...an!,
    student: { ...an!.student, id: crypto.randomUUID(), mssv: '20210002', fullName: 'Lê Văn Bình' },
    latest: { ...an!.latest!, submissionId: crypto.randomUUID(), version: 1 },
  };
  const payload = join(root, 'payload');
  await mkdir(payload);
  await writeFile(join(payload, 'main.py'), 'print(1)');
  const manifest = await computeManifest(payload);
  const ticket = {
    ...fixtureIssuedTicket,
    kind: 'gv_thu_bai' as const,
    assignmentId,
    crocCode: engine.generateCode(),
    expiresAt: new Date(Date.now() + 10_000).toISOString(),
    totalBytes: 8,
  };
  let blockedCalls = 0;
  vi.spyOn(api, 'call').mockImplementation((async (key: string, id?: string) => {
    switch (key) {
      case 'listSubmissions':
        return { rows: [blocked, binh] };
      case 'collect':
        if (id === blocked.latest.submissionId) {
          blockedCalls++;
          // Lần đầu VPS hết chỗ; lần hẹn lại thì bản đó đã bị thay (dừng vòng thử lại).
          throw new ClientError(blockedCalls === 1 ? 'CAPACITY_EXHAUSTED' : 'SUBMISSION_SUPERSEDED', 'x');
        }
        return {
          ticket,
          submission: {
            submissionId: binh.latest.submissionId,
            assignmentId,
            student: binh.student,
            version: 1,
            manifest,
            manifestHash: binh.latest.manifestHash,
          },
        };
      case 'getAssignment':
        return { title: 'Bài thu' };
      case 'ticketResult':
      case 'getTicket':
        return { ...fixtureTicketInfo, ticketId: ticket.ticketId, assignmentId, kind: 'gv_thu_bai', status: 'xong', receipt: null };
      default:
        throw new Error('unexpected call ' + key);
    }
  }) as unknown as RestClient['call']);

  const sender = engine.send({ relay: fixtureClientConfig.relay, code: ticket.crocCode, payloadDir: payload, timeoutMs: 10_000 });
  await jobs.collect(assignmentId);
  expect((await sender.done).ok).toBe(true);
  // SV Bình vẫn được thu dù SV trước đó lỗi.
  expect(await jobs.version(assignmentId, binh.student)).toBe(1);
  const dir = await jobs.collected(assignmentId);
  expect(await readFile(join(dir!, '20210002_LeVanBinh', 'main.py'), 'utf8')).toBe('print(1)');
  // CAPACITY_EXHAUSTED: hẹn thu lại.
  await vi.waitFor(() => expect(blockedCalls).toBe(2));
  await jobs.stop();
});
