import { afterEach, describe, expect, it } from 'vitest';
import {
  ApiErrorBodySchema,
  CODE_PHRASE_PATTERN,
  IssuedTicketSchema,
  LecturerAssignmentDetailSchema,
  LecturerAssignmentSchema,
  StudentAssignmentDetailSchema,
  StudentAssignmentSchema,
  type Manifest,
} from '@croc-classroom/shared';
import { fixtureManifest } from '@croc-classroom/shared/fixtures';
import { activatedStudents, serverHarness, MINUTE, type AccountsHarness } from './helpers.js';

let h: AccountsHarness;
afterEach(async () => {
  await h?.app.close();
});

const errorCode = (res: { json(): unknown }) => ApiErrorBodySchema.parse(res.json()).error.code;
const DEADLINE = '2026-11-24T16:59:59.000Z';

async function createAssignment(gv: string, body: Record<string, unknown> = {}) {
  return h.call('POST', '/assignments', {
    token: gv,
    body: { title: 'Bài tập 1', description: 'Mô tả', deadlineAt: DEADLINE, manifest: fixtureManifest, ...body },
  });
}

/** Giả lập worker của D báo đã nhận và xác minh đề. */
async function publish(assignmentId: string) {
  await h.assignments.service.onUploadStored({
    ticketId: h.issuer.issued.at(-1)?.ticketId ?? '00000000-0000-4000-8000-00000000f001',
    assignmentId,
    storageRef: `assignments/${assignmentId}/payload`,
    verifiedAt: h.clock.now().toISOString(),
  });
}

async function setup(env?: Record<string, string>) {
  h = await serverHarness(env ? { env } : {});
  const gv = await h.loginLecturer();
  const students = await activatedStudents(h, gv, ['20210001', '20210002', '20210003']);
  return { gv, sv: students };
}

describe('GV tạo bài', () => {
  it('tạo bài ở trạng thái dang_tai_len, có code phrase và vé gv_tai_len', async () => {
    const { gv } = await setup();
    const res = await createAssignment(gv);
    expect(res.statusCode).toBe(201);
    const { assignment, ticket } = res.json();
    expect(LecturerAssignmentSchema.parse(assignment)).toMatchObject({
      status: 'dang_tai_len',
      publishedAt: null,
      totalSize: 10,
      fileCount: 3,
      deadlineAt: DEADLINE,
      stats: { participants: 0, received: 0, seeding: 0, submitted: 0, late: 0, notSubmitted: 0 },
    });
    expect(assignment.codePhrase).toMatch(CODE_PHRASE_PATTERN);
    expect(IssuedTicketSchema.parse(ticket)).toMatchObject({ kind: 'gv_tai_len', assignmentId: assignment.id, totalBytes: 10 });
    expect(h.issuer.issued[0]?.request).toMatchObject({ assignmentId: assignment.id, manifest: fixtureManifest, totalBytes: 10 });
  });

  it('code phrase không trùng giữa các bài', async () => {
    const { gv } = await setup();
    const phrases = new Set<string>();
    for (let i = 0; i < 25; i++) phrases.add((await createAssignment(gv)).json().assignment.codePhrase);
    expect(phrases.size).toBe(25);
  });

  it('manifest sai → VALIDATION_FAILED; quá số file → MANIFEST_INVALID; quá dung lượng → PAYLOAD_TOO_LARGE', async () => {
    const { gv } = await setup({ LIMIT_MAX_MANIFEST_FILES: '2', LIMIT_MAX_ASSIGNMENT_BYTES: '100' });
    const badPath: Manifest = { version: 1, files: [{ path: '../ngoai.txt', size: 1, sha256: 'a'.repeat(64) }] };
    const bad = await createAssignment(gv, { manifest: badPath });
    expect([bad.statusCode, errorCode(bad)]).toEqual([400, 'VALIDATION_FAILED']);

    const tooMany = await createAssignment(gv);
    expect([tooMany.statusCode, errorCode(tooMany)]).toEqual([422, 'MANIFEST_INVALID']);

    const big: Manifest = { version: 1, files: [{ path: 'a.bin', size: 101, sha256: 'a'.repeat(64) }] };
    const tooBig = await createAssignment(gv, { manifest: big });
    expect([tooBig.statusCode, errorCode(tooBig)]).toEqual([413, 'PAYLOAD_TOO_LARGE']);
    expect(h.issuer.issued).toEqual([]);
  });

  it('VPS hết chỗ → 503 CAPACITY_EXHAUSTED và không để lại bài', async () => {
    const { gv } = await setup();
    h.issuer.full = true;
    const res = await createAssignment(gv);
    expect([res.statusCode, errorCode(res)]).toEqual([503, 'CAPACITY_EXHAUSTED']);
    expect((await h.call('GET', '/assignments', { token: gv })).json().assignments).toEqual([]);
  });

  it('tải lên lỗi: xin lại vé khi chưa phát hành; đã phát hành thì từ chối', async () => {
    const { gv } = await setup();
    const { assignment } = (await createAssignment(gv)).json();
    const renewed = await h.call('POST', `/assignments/${assignment.id}/upload-ticket`, { token: gv });
    expect(renewed.statusCode).toBe(201);
    expect(renewed.json().ticket.kind).toBe('gv_tai_len');
    expect(h.issuer.issued).toHaveLength(2);

    await publish(assignment.id);
    const after = await h.call('POST', `/assignments/${assignment.id}/upload-ticket`, { token: gv });
    expect([after.statusCode, errorCode(after)]).toEqual([409, 'ASSIGNMENT_ALREADY_PUBLISHED']);
    const missing = await h.call('POST', '/assignments/00000000-0000-4000-8000-000000009999/upload-ticket', { token: gv });
    expect(errorCode(missing)).toBe('NOT_FOUND');
  });
});

describe('phát hành', () => {
  it('chỉ phát hành khi worker báo đã xác minh; báo lặp không đổi giờ phát hành', async () => {
    const { gv } = await setup();
    const { assignment } = (await createAssignment(gv)).json();
    await publish(assignment.id);
    const detail = LecturerAssignmentDetailSchema.parse((await h.call('GET', `/assignments/${assignment.id}`, { token: gv })).json());
    expect(detail).toMatchObject({ status: 'da_phat_hanh', publishedAt: h.clock.now().toISOString(), manifest: fixtureManifest });
    expect(h.db.prepare('SELECT storage_ref FROM assignments').get()).toEqual({ storage_ref: `assignments/${assignment.id}/payload` });

    const firstPublished = detail.publishedAt;
    h.clock.advance(MINUTE);
    await publish(assignment.id);
    expect((await h.call('GET', `/assignments/${assignment.id}`, { token: gv })).json().publishedAt).toBe(firstPublished);
  });

  it('worker báo cho bài đã xoá thì bỏ qua', async () => {
    await setup();
    await expect(publish('00000000-0000-4000-8000-000000009999')).resolves.toBeUndefined();
  });
});

describe('SV nhập code phrase', () => {
  it('bài đang tải lên thì code chưa dùng được', async () => {
    const { gv, sv } = await setup();
    const { assignment } = (await createAssignment(gv)).json();
    const res = await h.call('POST', '/join', { token: sv['20210001']!.token, body: { codePhrase: assignment.codePhrase } });
    expect([res.statusCode, errorCode(res)]).toEqual([404, 'CODE_PHRASE_INVALID']);
  });

  it('sau khi phát hành: vào bài (gõ hoa/dấu cách), nhận manifest; vào lại trả cùng thông tin', async () => {
    const { gv, sv } = await setup();
    const { assignment } = (await createAssignment(gv)).json();
    await publish(assignment.id);

    const typed = ` ${(assignment.codePhrase as string).toUpperCase().replace(/-/g, ' ')} `;
    const res = await h.call('POST', '/join', { token: sv['20210001']!.token, body: { codePhrase: typed } });
    expect(res.statusCode).toBe(200);
    const joined = StudentAssignmentDetailSchema.parse(res.json());
    expect(joined).toMatchObject({ id: assignment.id, manifest: fixtureManifest, receivedAt: null, latestReceipt: null });

    h.clock.advance(MINUTE);
    const again = StudentAssignmentDetailSchema.parse(
      (await h.call('POST', '/join', { token: sv['20210001']!.token, body: { codePhrase: assignment.codePhrase } })).json(),
    );
    expect(again.joinedAt).toBe(joined.joinedAt);
    expect((await h.call('GET', `/assignments/${assignment.id}`, { token: gv })).json().stats.participants).toBe(1);
  });

  it('nhập sai 10 lần trong 5 phút thì bị chặn', async () => {
    const { gv, sv } = await setup();
    const { assignment } = (await createAssignment(gv)).json();
    await publish(assignment.id);
    const token = sv['20210001']!.token;
    for (let i = 0; i < 10; i++) {
      expect(errorCode(await h.call('POST', '/join', { token, body: { codePhrase: 'sao-mai-xanh-000' } }))).toBe('CODE_PHRASE_INVALID');
    }
    const blocked = await h.call('POST', '/join', { token, body: { codePhrase: assignment.codePhrase } });
    expect([blocked.statusCode, errorCode(blocked)]).toEqual([429, 'RATE_LIMITED']);
    // SV khác không bị ảnh hưởng.
    expect((await h.call('POST', '/join', { token: sv['20210002']!.token, body: { codePhrase: assignment.codePhrase } })).statusCode).toBe(200);
  });

  it('đủ số SV tối đa → ASSIGNMENT_FULL; SV đã tham gia vẫn vào lại được', async () => {
    const { gv, sv } = await setup({ LIMIT_MAX_STUDENTS_PER_ASSIGNMENT: '1' });
    const { assignment } = (await createAssignment(gv)).json();
    await publish(assignment.id);
    const body = { codePhrase: assignment.codePhrase };
    expect((await h.call('POST', '/join', { token: sv['20210001']!.token, body })).statusCode).toBe(200);
    expect(errorCode(await h.call('POST', '/join', { token: sv['20210002']!.token, body }))).toBe('ASSIGNMENT_FULL');
    expect((await h.call('POST', '/join', { token: sv['20210001']!.token, body })).statusCode).toBe(200);
  });

  it('code phrase sai định dạng → VALIDATION_FAILED (không tính là nhập sai)', async () => {
    const { sv } = await setup();
    const res = await h.call('POST', '/join', { token: sv['20210001']!.token, body: { codePhrase: 'abc' } });
    expect(errorCode(res)).toBe('VALIDATION_FAILED');
  });
});

describe('SV xem bài', () => {
  it('chỉ thấy bài đã tham gia; bài chưa tham gia → NOT_FOUND', async () => {
    const { gv, sv } = await setup();
    const a1 = (await createAssignment(gv, { title: 'Bài 1' })).json().assignment;
    const a2 = (await createAssignment(gv, { title: 'Bài 2' })).json().assignment;
    await publish(a1.id);
    await publish(a2.id);
    await h.call('POST', '/join', { token: sv['20210001']!.token, body: { codePhrase: a1.codePhrase } });

    const mine = await h.call('GET', '/my/assignments', { token: sv['20210001']!.token });
    const list = mine.json().assignments.map((a: unknown) => StudentAssignmentSchema.parse(a));
    expect(list.map((a: { title: string }) => a.title)).toEqual(['Bài 1']);
    expect(list[0]).not.toHaveProperty('manifest');

    expect((await h.call('GET', `/my/assignments/${a1.id}`, { token: sv['20210001']!.token })).statusCode).toBe(200);
    expect(errorCode(await h.call('GET', `/my/assignments/${a2.id}`, { token: sv['20210001']!.token }))).toBe('NOT_FOUND');
    expect((await h.call('GET', '/my/assignments', { token: sv['20210002']!.token })).json().assignments).toEqual([]);
  });

  it('SV không dùng được API bài tập của GV; GV không dùng được /join', async () => {
    const { gv, sv } = await setup();
    const { assignment } = (await createAssignment(gv)).json();
    const token = sv['20210001']!.token;
    for (const [method, url] of [
      ['GET', '/assignments'],
      ['GET', `/assignments/${assignment.id}`],
      ['DELETE', `/assignments/${assignment.id}`],
      ['POST', `/assignments/${assignment.id}/upload-ticket`],
    ] as const) {
      expect([url, errorCode(await h.call(method, url, { token }))]).toEqual([url, 'FORBIDDEN']);
    }
    expect(errorCode(await createAssignment(token))).toBe('FORBIDDEN');
    expect(errorCode(await h.call('POST', '/join', { token: gv, body: { codePhrase: assignment.codePhrase } }))).toBe('FORBIDDEN');
  });
});

describe('thống kê', () => {
  it('đếm tham gia, đã nhận, đang chia sẻ, đã nộp, trễ, chưa nộp', async () => {
    const { gv, sv } = await setup();
    const { assignment } = (await createAssignment(gv)).json();
    await publish(assignment.id);
    for (const mssv of ['20210001', '20210002', '20210003']) {
      await h.call('POST', '/join', { token: sv[mssv]!.token, body: { codePhrase: assignment.codePhrase } });
    }
    const verified = (studentId: string, source: 'vps' | 'peer') =>
      h.assignments.service.onFetchVerified({ ticketId: 't', assignmentId: assignment.id, studentId, source, verifiedAt: h.clock.now().toISOString() });
    await verified(sv['20210001']!.id, 'vps');
    await verified(sv['20210002']!.id, 'peer');
    h.seeding.set(assignment.id, 3);

    // Bài nộp (M3 chưa có API): ghi thẳng để kiểm tra cách đếm. SV1: v1 trễ rồi v2 đúng hạn. SV2: v1 trễ.
    const insert = h.db.prepare(
      `INSERT INTO submissions (id, assignment_id, student_id, version, received_at, is_late, total_size, file_count, manifest_json, manifest_hash)
       VALUES (?, ?, ?, ?, ?, ?, 1, 1, '{}', '${'c'.repeat(64)}')`,
    );
    insert.run('00000000-0000-4000-8000-000000000a01', assignment.id, sv['20210001']!.id, 1, h.clock.now().toISOString(), 1);
    insert.run('00000000-0000-4000-8000-000000000a02', assignment.id, sv['20210001']!.id, 2, h.clock.now().toISOString(), 0);
    insert.run('00000000-0000-4000-8000-000000000a03', assignment.id, sv['20210002']!.id, 1, h.clock.now().toISOString(), 1);

    const stats = (await h.call('GET', '/assignments', { token: gv })).json().assignments[0].stats;
    expect(stats).toEqual({ participants: 3, received: 2, seeding: 3, submitted: 2, late: 1, notSubmitted: 1 });

    const detail = StudentAssignmentDetailSchema.parse((await h.call('GET', `/my/assignments/${assignment.id}`, { token: sv['20210001']!.token })).json());
    expect(detail.receivedAt).toBe(h.clock.now().toISOString());
    expect(detail.latestReceipt).toMatchObject({ version: 2, isLate: false });
  });

  it('báo nhận đề lặp không ghi đè lần đầu; người chưa tham gia thì bỏ qua', async () => {
    const { gv, sv } = await setup();
    const { assignment } = (await createAssignment(gv)).json();
    await publish(assignment.id);
    await h.call('POST', '/join', { token: sv['20210001']!.token, body: { codePhrase: assignment.codePhrase } });
    const first = h.clock.now().toISOString();
    const report = (source: 'vps' | 'peer', studentId = sv['20210001']!.id) =>
      h.assignments.service.onFetchVerified({ ticketId: 't', assignmentId: assignment.id, studentId, source, verifiedAt: h.clock.now().toISOString() });
    await report('vps');
    h.clock.advance(MINUTE);
    await report('peer');
    await report('peer', sv['20210002']!.id);
    expect(h.db.prepare('SELECT student_id, received_at, received_from FROM participants').all()).toEqual([
      { student_id: sv['20210001']!.id, received_at: first, received_from: 'vps' },
    ]);
  });
});

describe('sửa và xoá bài', () => {
  it('chỉ sửa tiêu đề, mô tả, hạn nộp; không sửa được file', async () => {
    const { gv } = await setup();
    const { assignment } = (await createAssignment(gv)).json();
    const otherManifest = { version: 1, files: [{ path: 'khac.txt', size: 1, sha256: 'b'.repeat(64) }] };
    const res = await h.call('PATCH', `/assignments/${assignment.id}`, {
      token: gv,
      body: { title: '  Bài 1 (sửa) ', deadlineAt: null, manifest: otherManifest },
    });
    expect(LecturerAssignmentSchema.parse(res.json())).toMatchObject({ title: 'Bài 1 (sửa)', deadlineAt: null, description: 'Mô tả' });
    expect((await h.call('GET', `/assignments/${assignment.id}`, { token: gv })).json().manifest).toEqual(fixtureManifest);

    expect(errorCode(await h.call('PATCH', `/assignments/${assignment.id}`, { token: gv, body: {} }))).toBe('VALIDATION_FAILED');
    expect(errorCode(await h.call('PATCH', '/assignments/00000000-0000-4000-8000-000000009999', { token: gv, body: { title: 'x' } }))).toBe('NOT_FOUND');
  });

  it('xoá bài: nhờ D dọn VPS rồi xoá dữ liệu; SV không còn thấy bài; xoá lại → NOT_FOUND', async () => {
    const { gv, sv } = await setup();
    const { assignment } = (await createAssignment(gv)).json();
    await publish(assignment.id);
    await h.call('POST', '/join', { token: sv['20210001']!.token, body: { codePhrase: assignment.codePhrase } });

    expect((await h.call('DELETE', `/assignments/${assignment.id}`, { token: gv })).statusCode).toBe(204);
    expect(h.issuer.purged).toEqual([assignment.id]);
    expect(h.db.prepare('SELECT COUNT(*) AS n FROM participants').get()).toEqual({ n: 0 });
    expect((await h.call('GET', '/my/assignments', { token: sv['20210001']!.token })).json().assignments).toEqual([]);
    expect(errorCode(await h.call('DELETE', `/assignments/${assignment.id}`, { token: gv }))).toBe('NOT_FOUND');
  });

  it('D dọn VPS lỗi thì giữ nguyên bài để GV xoá lại', async () => {
    const { gv } = await setup();
    const { assignment } = (await createAssignment(gv)).json();
    h.issuer.purgeAssignment = async () => {
      throw new Error('mất kết nối worker');
    };
    expect((await h.call('DELETE', `/assignments/${assignment.id}`, { token: gv })).statusCode).toBe(500);
    expect((await h.call('GET', `/assignments/${assignment.id}`, { token: gv })).statusCode).toBe(200);
  });
});
