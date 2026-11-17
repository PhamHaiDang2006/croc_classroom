import { afterEach, describe, expect, it } from 'vitest';
import {
  ApiErrorBodySchema,
  CollectTicketSchema,
  IssuedTicketSchema,
  ReceiptSchema,
  SubmissionRowSchema,
  type Manifest,
} from '@croc-classroom/shared';
import { fixtureManifest, fixtureSubmissionManifest } from '@croc-classroom/shared/fixtures';
import { manifestHash } from '@croc-classroom/shared/node';
import { activatedStudents, serverHarness, DAY, MINUTE, type AccountsHarness } from './helpers.js';

let h: AccountsHarness;
afterEach(async () => {
  await h?.app.close();
});

const errorCode = (res: { json(): unknown }) => ApiErrorBodySchema.parse(res.json()).error.code;
/** Hạn nộp: 1 ngày sau thời điểm bắt đầu của đồng hồ giả. */
const DEADLINE = '2026-11-18T08:00:00.000Z';

interface World {
  gv: string;
  assignmentId: string;
  sv: Record<string, { id: string; token: string }>;
}

/** GV, một bài đã phát hành (có hạn nộp), ba SV đã kích hoạt; SV 1 và 2 đã vào bài. */
async function setup(options: { env?: Record<string, string>; deadline?: string | null } = {}): Promise<World> {
  h = await serverHarness(options.env ? { env: options.env } : {});
  const gv = await h.loginLecturer();
  const sv = await activatedStudents(h, gv, ['20210001', '20210002', '20210003']);
  const created = await h.call('POST', '/assignments', {
    token: gv,
    body: { title: 'Bài 1', deadlineAt: options.deadline === undefined ? DEADLINE : options.deadline, manifest: fixtureManifest },
  });
  const { id, codePhrase } = created.json().assignment;
  await h.outcomes.onUploadStored({ ticketId: h.issuer.issued[0]!.ticketId, assignmentId: id, storageRef: `a/${id}`, verifiedAt: h.clock.now().toISOString() });
  for (const mssv of ['20210001', '20210002']) {
    await h.call('POST', '/join', { token: sv[mssv]!.token, body: { codePhrase } });
  }
  return { gv, assignmentId: id, sv };
}

async function submit(w: World, mssv: string, manifest: Manifest = fixtureSubmissionManifest) {
  return h.call('POST', `/assignments/${w.assignmentId}/submit`, { token: w.sv[mssv]!.token, body: { manifest } });
}

/** Giả lập worker của D: đã nhận và xác minh bài nộp của vé này. */
function stored(w: World, mssv: string, ticketId: string, manifest: Manifest = fixtureSubmissionManifest) {
  return h.outcomes.onSubmissionStored({
    ticketId,
    assignmentId: w.assignmentId,
    studentId: w.sv[mssv]!.id,
    manifest,
    storageRef: `s/${ticketId}`,
    verifiedAt: h.clock.now().toISOString(),
  });
}

/** Xin vé + worker lưu xong → biên nhận. */
async function submitAndStore(w: World, mssv: string, manifest: Manifest = fixtureSubmissionManifest) {
  const ticket = (await submit(w, mssv, manifest)).json().ticket;
  const result = await stored(w, mssv, ticket.ticketId, manifest);
  if (!result.accepted) throw new Error('worker bị từ chối');
  return result;
}

const ticketStatus = (id: string) => (h.db.prepare('SELECT status, failure_reason, submission_id FROM tickets WHERE id = ?').get(id) as Record<string, unknown>);

describe('SV xin vé nộp bài', () => {
  it('SV đã vào bài nhận vé nop_bai; vé được ghi đang chạy', async () => {
    const w = await setup();
    const res = await submit(w, '20210001');
    expect(res.statusCode).toBe(201);
    const ticket = IssuedTicketSchema.parse(res.json().ticket);
    expect(ticket).toMatchObject({ kind: 'nop_bai', assignmentId: w.assignmentId, totalBytes: 6 });
    expect(h.issuer.issued.at(-1)?.request).toMatchObject({ studentId: w.sv['20210001']!.id, manifest: fixtureSubmissionManifest });
    expect(ticketStatus(ticket.ticketId)).toMatchObject({ status: 'dang_chay' });
  });

  it('chưa vào bài → NOT_PARTICIPANT; bài không có → NOT_FOUND; GV → FORBIDDEN', async () => {
    const w = await setup();
    expect(errorCode(await submit(w, '20210003'))).toBe('NOT_PARTICIPANT');
    const missing = await h.call('POST', '/assignments/00000000-0000-4000-8000-000000009999/submit', {
      token: w.sv['20210001']!.token,
      body: { manifest: fixtureSubmissionManifest },
    });
    expect(errorCode(missing)).toBe('NOT_FOUND');
    const byGv = await h.call('POST', `/assignments/${w.assignmentId}/submit`, { token: w.gv, body: { manifest: fixtureSubmissionManifest } });
    expect(errorCode(byGv)).toBe('FORBIDDEN');
  });

  it('vượt 200 MB → PAYLOAD_TOO_LARGE; quá số file → MANIFEST_INVALID; không mở vé', async () => {
    // Đề có 3 file nên giới hạn đặt 3; bài nộp 4 file thì vượt.
    const w = await setup({ env: { LIMIT_MAX_MANIFEST_FILES: '3' } });
    const big: Manifest = { version: 1, files: [{ path: 'video.mp4', size: 200 * 1024 * 1024 + 1, sha256: 'a'.repeat(64) }] };
    const tooBig = await submit(w, '20210001', big);
    expect([tooBig.statusCode, errorCode(tooBig)]).toEqual([413, 'PAYLOAD_TOO_LARGE']);
    const fourFiles: Manifest = { version: 1, files: ['a', 'b', 'c', 'd'].map((p) => ({ path: `${p}.txt`, size: 1, sha256: 'a'.repeat(64) })) };
    const tooMany = await submit(w, '20210001', fourFiles);
    expect([tooMany.statusCode, errorCode(tooMany)]).toEqual([422, 'MANIFEST_INVALID']);
    expect(h.issuer.issued.filter((t) => t.kind === 'nop_bai')).toEqual([]);
  });

  it('VPS hết chỗ → 503', async () => {
    const w = await setup();
    h.issuer.full = true;
    expect(errorCode(await submit(w, '20210001'))).toBe('CAPACITY_EXHAUSTED');
  });
});

describe('worker báo đã lưu bài nộp', () => {
  it('đúng hạn: phiên bản 1, giờ nộp = giờ xác minh, mã băm tổng do server tính; vé chuyển xong', async () => {
    const w = await setup();
    const ticket = (await submit(w, '20210001')).json().ticket;
    h.clock.advance(MINUTE);
    const result = await stored(w, '20210001', ticket.ticketId);

    expect(result).toEqual({
      accepted: true,
      supersededStorageRefs: [],
      receipt: {
        submissionId: expect.any(String),
        assignmentId: w.assignmentId,
        version: 1,
        receivedAt: h.clock.now().toISOString(),
        isLate: false,
        totalSize: 6,
        fileCount: 1,
        manifestHash: manifestHash(fixtureSubmissionManifest),
      },
    });
    expect(ticketStatus(ticket.ticketId)).toMatchObject({ status: 'xong', submission_id: result.accepted && result.receipt.submissionId });
  });

  it('nộp lại sau hạn: phiên bản 2 bị đánh dấu trễ; bản cũ không còn file', async () => {
    const w = await setup();
    const v1 = await submitAndStore(w, '20210001');
    h.clock.advance(2 * DAY);
    const v2 = await submitAndStore(w, '20210001');
    expect(v2.receipt).toMatchObject({ version: 2, isLate: true });
    expect(v2.supersededStorageRefs).toHaveLength(1);
    const refs = h.db.prepare('SELECT version, storage_ref FROM submissions ORDER BY version').all() as { version: number; storage_ref: string | null }[];
    expect(refs.map((r) => [r.version, r.storage_ref === null])).toEqual([
      [1, true],
      [2, false],
    ]);
    expect(v2.supersededStorageRefs[0]).toMatch(/^s\//);
    expect(v1.receipt.version).toBe(1);
  });

  it('bài không có hạn nộp thì không bao giờ trễ', async () => {
    const w = await setup({ deadline: null });
    // Quá xa mốc hạn nộp mặc định của các test khác (nhưng dưới 30 ngày để phiên đăng nhập còn hạn).
    h.clock.advance(25 * DAY);
    expect((await submitAndStore(w, '20210001')).receipt.isLate).toBe(false);
  });

  it('nộp hai lần liền: vé đầu bị thay; worker báo vé đầu xong muộn thì bị từ chối, không lệch thứ tự', async () => {
    const w = await setup();
    const first = (await submit(w, '20210001')).json().ticket;
    const second = (await submit(w, '20210001')).json().ticket;
    expect(ticketStatus(first.ticketId)).toMatchObject({ status: 'huy', failure_reason: 'superseded' });

    expect((await stored(w, '20210001', second.ticketId)).accepted).toBe(true);
    expect(await stored(w, '20210001', first.ticketId)).toEqual({ accepted: false, reason: 'ticket_not_active' });
    expect(h.db.prepare('SELECT COUNT(*) AS n FROM submissions').get()).toEqual({ n: 1 });
  });

  it('bản mới lỗi (vé hết hạn) không làm mất bản cũ', async () => {
    const w = await setup();
    await submitAndStore(w, '20210001');
    const failing = (await submit(w, '20210001')).json().ticket;
    h.db.prepare(`UPDATE tickets SET status = 'het_han' WHERE id = ?`).run(failing.ticketId);
    expect((await stored(w, '20210001', failing.ticketId)).accepted).toBe(false);

    const receipt = await h.call('GET', `/assignments/${w.assignmentId}/receipt`, { token: w.sv['20210001']!.token });
    expect(ReceiptSchema.parse(receipt.json()).version).toBe(1);
    expect(h.db.prepare('SELECT storage_ref FROM submissions').get()).toEqual({ storage_ref: expect.stringMatching(/^s\//) });
  });

  it('worker gọi lặp sau khi đã commit: trả cùng biên nhận, không tạo phiên bản mới', async () => {
    const w = await setup();
    const ticket = (await submit(w, '20210001')).json().ticket;
    const first = await stored(w, '20210001', ticket.ticketId);
    const again = await stored(w, '20210001', ticket.ticketId);
    expect(again).toEqual({ accepted: true, receipt: first.accepted && first.receipt, supersededStorageRefs: [] });
    expect(h.db.prepare('SELECT COUNT(*) AS n FROM submissions').get()).toEqual({ n: 1 });
  });

  it('vé không khớp SV / bài / loại → từ chối', async () => {
    const w = await setup();
    const ticket = (await submit(w, '20210001')).json().ticket;
    expect((await stored(w, '20210002', ticket.ticketId)).accepted).toBe(false);
    expect((await stored(w, '20210001', h.issuer.issued[0]!.ticketId)).accepted).toBe(false);
    expect((await stored(w, '20210001', '00000000-0000-4000-8000-000000009999')).accepted).toBe(false);
  });
});

describe('biên nhận', () => {
  it('SV xem lại biên nhận mới nhất của mình sau khi mất kết nối', async () => {
    const w = await setup();
    const url = `/assignments/${w.assignmentId}/receipt`;
    expect(errorCode(await h.call('GET', url, { token: w.sv['20210001']!.token }))).toBe('NOT_FOUND');
    const { receipt } = await submitAndStore(w, '20210001');
    expect(ReceiptSchema.parse((await h.call('GET', url, { token: w.sv['20210001']!.token })).json())).toEqual(receipt);
    // SV khác (đã/chưa vào bài) không thấy biên nhận của SV 1.
    expect(errorCode(await h.call('GET', url, { token: w.sv['20210002']!.token }))).toBe('NOT_FOUND');
    expect(errorCode(await h.call('GET', url, { token: w.sv['20210003']!.token }))).toBe('NOT_FOUND');
  });

  it('chi tiết bài của SV có biên nhận mới nhất', async () => {
    const w = await setup();
    await submitAndStore(w, '20210001');
    h.clock.advance(MINUTE);
    const { receipt } = await submitAndStore(w, '20210001');
    const detail = await h.call('GET', `/my/assignments/${w.assignmentId}`, { token: w.sv['20210001']!.token });
    expect(detail.json().latestReceipt).toEqual(receipt);
  });
});

describe('GV xem và thu bài', () => {
  it('danh sách: mỗi SV đã vào bài một dòng, trạng thái chưa nộp / đã nộp / trễ, số lần nộp', async () => {
    const w = await setup();
    await submitAndStore(w, '20210001');
    await submitAndStore(w, '20210001');
    h.clock.advance(2 * DAY);
    await submitAndStore(w, '20210002');

    const res = await h.call('GET', `/assignments/${w.assignmentId}/submissions`, { token: w.gv });
    const rows = res.json().rows.map((r: unknown) => SubmissionRowSchema.parse(r));
    expect(rows.map((r: { student: { mssv: string }; state: string; submitCount: number }) => [r.student.mssv, r.state, r.submitCount])).toEqual([
      ['20210001', 'da_nop', 2],
      ['20210002', 'nop_tre', 1],
    ]);
    expect(rows[0].latest).toMatchObject({ version: 2, collectedAt: null });

    const stats = (await h.call('GET', `/assignments/${w.assignmentId}`, { token: w.gv })).json().stats;
    expect(stats).toMatchObject({ participants: 2, submitted: 2, late: 1, notSubmitted: 0 });
  });

  it('SV không xem được danh sách, không thu được bài của người khác', async () => {
    const w = await setup();
    const { receipt } = await submitAndStore(w, '20210001');
    const token = w.sv['20210002']!.token;
    expect(errorCode(await h.call('GET', `/assignments/${w.assignmentId}/submissions`, { token }))).toBe('FORBIDDEN');
    expect(errorCode(await h.call('POST', `/submissions/${receipt.submissionId}/collect`, { token }))).toBe('FORBIDDEN');
  });

  it('thu phiên bản mới nhất: vé gv_thu_bai kèm manifest và phiên bản; phiên bản cũ → SUBMISSION_SUPERSEDED', async () => {
    const w = await setup();
    const v1 = await submitAndStore(w, '20210001');
    const v2 = await submitAndStore(w, '20210001', fixtureManifest);

    const res = await h.call('POST', `/submissions/${v2.receipt.submissionId}/collect`, { token: w.gv });
    expect(res.statusCode).toBe(201);
    const collect = CollectTicketSchema.parse(res.json());
    expect(collect.ticket.kind).toBe('gv_thu_bai');
    expect(collect.submission).toMatchObject({ version: 2, manifest: fixtureManifest, manifestHash: manifestHash(fixtureManifest) });
    expect(collect.submission.student.mssv).toBe('20210001');
    expect(h.issuer.issued.at(-1)?.request).toMatchObject({ submissionId: v2.receipt.submissionId, storageRef: expect.stringMatching(/^s\//) });
    expect(ticketStatus(collect.ticket.ticketId)).toMatchObject({ status: 'dang_chay', submission_id: v2.receipt.submissionId });

    const old = await h.call('POST', `/submissions/${v1.receipt.submissionId}/collect`, { token: w.gv });
    expect([old.statusCode, errorCode(old)]).toEqual([409, 'SUBMISSION_SUPERSEDED']);
    expect(errorCode(await h.call('POST', '/submissions/00000000-0000-4000-8000-000000009999/collect', { token: w.gv }))).toBe('NOT_FOUND');
  });

  it('GV thu bài của nhiều SV song song: vé của SV này không huỷ vé của SV kia', async () => {
    const w = await setup();
    const a = await submitAndStore(w, '20210001');
    const b = await submitAndStore(w, '20210002');
    const ta = (await h.call('POST', `/submissions/${a.receipt.submissionId}/collect`, { token: w.gv })).json().ticket;
    const tb = (await h.call('POST', `/submissions/${b.receipt.submissionId}/collect`, { token: w.gv })).json().ticket;
    expect(ticketStatus(ta.ticketId)).toMatchObject({ status: 'dang_chay' });
    expect(ticketStatus(tb.ticketId)).toMatchObject({ status: 'dang_chay' });
  });

  it('xác nhận đã tải gắn với đúng phiên bản; báo lặp không ghi đè', async () => {
    const w = await setup();
    const v1 = await submitAndStore(w, '20210001');
    const collect = (await h.call('POST', `/submissions/${v1.receipt.submissionId}/collect`, { token: w.gv })).json();
    const confirmedAt = h.clock.now().toISOString();
    await h.outcomes.onCollectConfirmed({ ticketId: collect.ticket.ticketId, submissionId: v1.receipt.submissionId, confirmedAt });
    h.clock.advance(MINUTE);
    await h.outcomes.onCollectConfirmed({ ticketId: collect.ticket.ticketId, submissionId: v1.receipt.submissionId, confirmedAt: h.clock.now().toISOString() });

    let row = (await h.call('GET', `/assignments/${w.assignmentId}/submissions`, { token: w.gv })).json().rows[0];
    expect(row.latest).toMatchObject({ version: 1, collectedAt: confirmedAt });

    // SV nộp bản mới: bản mới chưa được tải.
    await submitAndStore(w, '20210001');
    row = (await h.call('GET', `/assignments/${w.assignmentId}/submissions`, { token: w.gv })).json().rows[0];
    expect(row.latest).toMatchObject({ version: 2, collectedAt: null });
  });
});

describe('xoá bài', () => {
  it('xoá bài thì xoá cả bài nộp và vé', async () => {
    const w = await setup();
    await submitAndStore(w, '20210001');
    await h.call('DELETE', `/assignments/${w.assignmentId}`, { token: w.gv });
    expect(h.db.prepare('SELECT (SELECT COUNT(*) FROM submissions) AS s, (SELECT COUNT(*) FROM tickets) AS t').get()).toEqual({ s: 0, t: 0 });
  });
});
