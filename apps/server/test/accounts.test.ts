import { Writable } from 'node:stream';
import { afterEach, describe, expect, it } from 'vitest';
import {
  ApiErrorBodySchema,
  ClientConfigSchema,
  SessionSchema,
  StudentImportResultSchema,
  StudentSchema,
  UserSchema,
} from '@croc-classroom/shared';
import { accountsHarness, DAY, LECTURER, MINUTE, type AccountsHarness } from './helpers.js';

let h: AccountsHarness;
afterEach(async () => {
  await h?.app.close();
});

const CSV = 'mssv,ho_ten,lop\n20210001,Trần Thị An,CNTT-K66\n20210002,Lê Văn Bình,\n';
const STUDENT_PASSWORD = 'mat-khau-sv-1';

function errorCode(res: { json(): unknown }): string {
  return ApiErrorBodySchema.parse(res.json()).error.code;
}

/** Nhập CSV và trả mã kích hoạt theo MSSV. */
async function importStudents(gvToken: string, csv = CSV): Promise<Record<string, { id: string; code: string }>> {
  const res = await h.call('POST', '/students/import', { token: gvToken, body: { csv } });
  expect(res.statusCode).toBe(200);
  const result = StudentImportResultSchema.parse(res.json());
  return Object.fromEntries(result.created.map((c) => [c.student.mssv, { id: c.student.id, code: c.activation.activationCode }]));
}

async function activate(mssv: string, activationCode: string, newPassword = STUDENT_PASSWORD) {
  return h.call('POST', '/auth/activate', { body: { mssv, activationCode, newPassword } });
}

async function loginStudent(mssv: string, password = STUDENT_PASSWORD) {
  return h.call('POST', '/auth/login', { body: { role: 'student', mssv, password } });
}

describe('giảng viên', () => {
  it('đăng nhập bằng username, xem /me và /config (relay chỉ cho người đã đăng nhập)', async () => {
    h = await accountsHarness();
    const token = await h.loginLecturer();

    const me = await h.call('GET', '/me', { token });
    expect(UserSchema.parse(me.json())).toMatchObject({ role: 'lecturer', username: LECTURER.username });

    const config = await h.call('GET', '/config', { token });
    expect(ClientConfigSchema.parse(config.json()).relay).toEqual({ address: 'relay.test:9009', password: 'mat-khau-relay-test' });

    expect((await h.call('GET', '/config')).statusCode).toBe(401);
  });

  it('sai mật khẩu hoặc sai vai trò → INVALID_CREDENTIALS', async () => {
    h = await accountsHarness();
    const wrong = await h.call('POST', '/auth/login', { body: { role: 'lecturer', username: LECTURER.username, password: 'sai-mat-khau' } });
    expect([wrong.statusCode, errorCode(wrong)]).toEqual([401, 'INVALID_CREDENTIALS']);
    const nobody = await h.call('POST', '/auth/login', { body: { role: 'lecturer', username: 'khong-ai', password: 'sai-mat-khau' } });
    expect(errorCode(nobody)).toBe('INVALID_CREDENTIALS');
  });
});

describe('nhập CSV', () => {
  it('tạo SV chưa kích hoạt kèm mã một lần; nhập lại thì bỏ qua MSSV đã có', async () => {
    h = await accountsHarness();
    const gv = await h.loginLecturer();
    const codes = await importStudents(gv);
    expect(Object.keys(codes)).toEqual(['20210001', '20210002']);

    const again = await h.call('POST', '/students/import', { token: gv, body: { csv: CSV + '20210001,Trùng trong file\n' } });
    const result = StudentImportResultSchema.parse(again.json());
    expect(result.created).toEqual([]);
    expect(result.skipped).toEqual([
      { line: 2, mssv: '20210001', reason: 'already_exists' },
      { line: 3, mssv: '20210002', reason: 'already_exists' },
      { line: 4, mssv: '20210001', reason: 'duplicate_in_file' },
    ]);

    const list = await h.call('GET', '/students', { token: gv });
    const students = list.json().students.map((s: unknown) => StudentSchema.parse(s));
    expect(students.map((s: { mssv: string; activated: boolean }) => [s.mssv, s.activated])).toEqual([
      ['20210001', false],
      ['20210002', false],
    ]);
    expect(students[0].activationExpiresAt).toBe(new Date(h.clock.now().getTime() + 14 * DAY).toISOString());
  });

  it('có lỗi định dạng thì không tạo tài khoản nào', async () => {
    h = await accountsHarness();
    const gv = await h.loginLecturer();
    const res = await h.call('POST', '/students/import', { token: gv, body: { csv: '20210001,An\n20210002\n' } });
    const result = StudentImportResultSchema.parse(res.json());
    expect(result).toMatchObject({ imported: false, created: [], errors: [{ line: 2, message: 'thiếu họ tên' }] });
    expect((await h.call('GET', '/students', { token: gv })).json().students).toEqual([]);
  });

  it('CSDL chỉ lưu bản băm của mật khẩu, mã kích hoạt và token', async () => {
    h = await accountsHarness();
    const gv = await h.loginLecturer();
    const { '20210001': an } = await importStudents(gv);
    const row = h.db.prepare(`SELECT * FROM users WHERE mssv = '20210001'`).get() as Record<string, string>;
    expect(row['activation_code_hash']).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(row)).not.toContain(an!.code);

    const session = SessionSchema.parse((await activate('20210001', an!.code)).json());
    const all = JSON.stringify(h.db.prepare('SELECT * FROM sessions').all()) + JSON.stringify(h.db.prepare('SELECT * FROM users').all());
    expect(all).not.toContain(session.token);
    expect(all).not.toContain(STUDENT_PASSWORD);
    expect(all).toContain('$argon2id$v=19$');
  });
});

describe('kích hoạt và đăng nhập sinh viên', () => {
  it('chưa kích hoạt → ACCOUNT_NOT_ACTIVATED; kích hoạt (gõ chữ thường, không gạch) → có phiên', async () => {
    h = await accountsHarness();
    const { '20210001': an } = await importStudents(await h.loginLecturer());

    expect(errorCode(await loginStudent('20210001'))).toBe('ACCOUNT_NOT_ACTIVATED');

    const res = await activate(' 20210001 ', an!.code.toLowerCase().replace(/-/g, ''));
    expect(res.statusCode).toBe(200);
    const session = SessionSchema.parse(res.json());
    expect(session.user).toMatchObject({ role: 'student', mssv: '20210001', classLabel: 'CNTT-K66' });

    const me = await h.call('GET', '/me', { token: session.token });
    expect(me.json()).toMatchObject({ role: 'student', fullName: 'Trần Thị An' });
    expect((await loginStudent('20210001')).statusCode).toBe(200);
  });

  it('mã đã dùng, sai mã, mã hết hạn đều bị từ chối', async () => {
    h = await accountsHarness();
    const codes = await importStudents(await h.loginLecturer());
    expect((await activate('20210001', codes['20210001']!.code)).statusCode).toBe(200);
    expect(errorCode(await activate('20210001', codes['20210001']!.code))).toBe('ACTIVATION_INVALID');
    expect(errorCode(await activate('20210002', 'AAAA-BBBB-CCCC'))).toBe('ACTIVATION_INVALID');
    expect(errorCode(await activate('99999999', codes['20210002']!.code))).toBe('ACTIVATION_INVALID');

    h.clock.advance(14 * DAY + 1);
    expect(errorCode(await activate('20210002', codes['20210002']!.code))).toBe('ACTIVATION_INVALID');
  });

  it('mật khẩu mới ngắn hơn 8 ký tự → VALIDATION_FAILED, mã vẫn còn dùng được', async () => {
    h = await accountsHarness();
    const { '20210001': an } = await importStudents(await h.loginLecturer());
    const res = await activate('20210001', an!.code, 'ngan');
    expect([res.statusCode, errorCode(res)]).toEqual([400, 'VALIDATION_FAILED']);
    expect((await activate('20210001', an!.code)).statusCode).toBe(200);
  });
});

describe('phân quyền', () => {
  it('SV không gọi được API của GV; chưa đăng nhập → 401', async () => {
    h = await accountsHarness();
    const gv = await h.loginLecturer();
    const { '20210001': an } = await importStudents(gv);
    const sv = SessionSchema.parse((await activate('20210001', an!.code)).json()).token;

    for (const [method, url, body] of [
      ['GET', '/students', undefined],
      ['POST', '/students/import', { csv: CSV }],
      ['PATCH', `/students/${an!.id}`, { disabled: true }],
      ['POST', `/students/${an!.id}/activation-code`, undefined],
    ] as const) {
      const res = await h.call(method, url, { token: sv, body });
      expect([url, res.statusCode, errorCode(res)]).toEqual([url, 403, 'FORBIDDEN']);
      expect((await h.call(method, url, { body })).statusCode).toBe(401);
    }
  });
});

describe('vô hiệu hoá, cấp lại mã', () => {
  it('vô hiệu hoá thu hồi mọi phiên và chặn đăng nhập; mở lại thì đăng nhập được', async () => {
    h = await accountsHarness();
    const gv = await h.loginLecturer();
    const { '20210001': an } = await importStudents(gv);
    const sv = SessionSchema.parse((await activate('20210001', an!.code)).json()).token;
    const revoked: string[] = [];
    h.accounts.sessions.onUserSessionsRevoked((userId) => revoked.push(userId));

    const disabled = await h.call('PATCH', `/students/${an!.id}`, { token: gv, body: { disabled: true } });
    expect(StudentSchema.parse(disabled.json())).toMatchObject({ disabled: true, activated: true });
    expect(revoked).toEqual([an!.id]);
    expect((await h.call('GET', '/me', { token: sv })).statusCode).toBe(401);
    expect(errorCode(await loginStudent('20210001'))).toBe('ACCOUNT_DISABLED');
    // Sai mật khẩu thì không tiết lộ tài khoản đang bị vô hiệu hoá.
    expect(errorCode(await loginStudent('20210001', 'sai-mat-khau'))).toBe('INVALID_CREDENTIALS');

    await h.call('PATCH', `/students/${an!.id}`, { token: gv, body: { disabled: false } });
    expect((await loginStudent('20210001')).statusCode).toBe(200);
  });

  it('cấp lại mã: SV đặt mật khẩu mới, phiên cũ và mật khẩu cũ mất hiệu lực', async () => {
    h = await accountsHarness();
    const gv = await h.loginLecturer();
    const { '20210001': an } = await importStudents(gv);
    const oldToken = SessionSchema.parse((await activate('20210001', an!.code)).json()).token;

    const issued = await h.call('POST', `/students/${an!.id}/activation-code`, { token: gv });
    expect(issued.statusCode).toBe(201);
    const newCode = issued.json().activationCode as string;

    expect((await activate('20210001', newCode, 'mat-khau-moi-2')).statusCode).toBe(200);
    expect((await h.call('GET', '/me', { token: oldToken })).statusCode).toBe(401);
    expect(errorCode(await loginStudent('20210001'))).toBe('INVALID_CREDENTIALS');
    expect((await loginStudent('20210001', 'mat-khau-moi-2')).statusCode).toBe(200);
  });

  it('ID không phải SV → NOT_FOUND', async () => {
    h = await accountsHarness();
    const gv = await h.loginLecturer();
    const missing = '00000000-0000-4000-8000-000000009999';
    expect(errorCode(await h.call('PATCH', `/students/${missing}`, { token: gv, body: { disabled: true } }))).toBe('NOT_FOUND');
    expect(errorCode(await h.call('POST', `/students/${missing}/activation-code`, { token: gv }))).toBe('NOT_FOUND');
  });
});

describe('giới hạn tần suất', () => {
  it('10 lần sai mật khẩu / 5 phút → bị chặn kể cả khi nhập đúng; hết 5 phút thì mở', async () => {
    h = await accountsHarness();
    const { '20210001': an } = await importStudents(await h.loginLecturer());
    await activate('20210001', an!.code);

    for (let i = 0; i < 10; i++) expect(errorCode(await loginStudent('20210001', 'sai-mat-khau'))).toBe('INVALID_CREDENTIALS');
    const blocked = await loginStudent('20210001');
    expect(blocked.statusCode).toBe(429);
    expect(ApiErrorBodySchema.parse(blocked.json()).error).toMatchObject({ code: 'RATE_LIMITED', details: { retryAfterSeconds: 300 } });

    h.clock.advance(5 * MINUTE);
    expect((await loginStudent('20210001')).statusCode).toBe(200);
  });

  it('đoán mật khẩu song song không vượt 10 lần / 5 phút (review C/Backend)', async () => {
    h = await accountsHarness();
    const results = await Promise.all(
      Array.from({ length: 40 }, () =>
        h.call('POST', '/auth/login', { body: { role: 'lecturer', username: LECTURER.username, password: 'sai-mat-khau' } }),
      ),
    );
    const codes = results.map((res) => errorCode(res));
    expect(codes.filter((c) => c === 'INVALID_CREDENTIALS')).toHaveLength(10);
    expect(codes.filter((c) => c === 'RATE_LIMITED')).toHaveLength(30);
  });

  it('lần thử không sai mật khẩu không bị tính vào giới hạn', async () => {
    h = await accountsHarness();
    const gv = await h.loginLecturer();
    const { '20210001': an } = await importStudents(gv);
    // Chưa kích hoạt: không chạy băm, không tính.
    for (let i = 0; i < 12; i++) expect(errorCode(await loginStudent('20210001'))).toBe('ACCOUNT_NOT_ACTIVATED');
    await activate('20210001', an!.code);
    // Đăng nhập đúng nhiều lần cũng không tính (kể cả trần theo IP).
    for (let i = 0; i < 12; i++) expect((await loginStudent('20210001')).statusCode).toBe(200);
    // Bị vô hiệu hoá, mật khẩu đúng: không tính.
    await h.call('PATCH', `/students/${an!.id}`, { token: gv, body: { disabled: true } });
    for (let i = 0; i < 12; i++) expect(errorCode(await loginStudent('20210001'))).toBe('ACCOUNT_DISABLED');
    await h.call('PATCH', `/students/${an!.id}`, { token: gv, body: { disabled: false } });
    // 9 lần sai rồi đúng: vẫn đăng nhập được, bộ đếm của tài khoản được xoá.
    for (let i = 0; i < 9; i++) expect(errorCode(await loginStudent('20210001', 'sai-mat-khau'))).toBe('INVALID_CREDENTIALS');
    expect((await loginStudent('20210001')).statusCode).toBe(200);
    for (let i = 0; i < 9; i++) expect(errorCode(await loginStudent('20210001', 'sai-mat-khau'))).toBe('INVALID_CREDENTIALS');
    expect((await loginStudent('20210001')).statusCode).toBe(200);
  });

  it('đổi địa chỉ IPv6 trong cùng dải /64 không thoát giới hạn của tài khoản (review M0–M3)', async () => {
    h = await accountsHarness();
    const { '20210001': an } = await importStudents(await h.loginLecturer());
    await activate('20210001', an!.code);
    const loginFrom = (remoteAddress: string, password: string) =>
      h.app.inject({ method: 'POST', url: '/auth/login', remoteAddress, payload: { role: 'student', mssv: '20210001', password } });
    for (let i = 1; i <= 10; i++) expect((await loginFrom(`2001:db8:1:2::${i.toString(16)}`, 'sai-mat-khau')).statusCode).toBe(401);
    expect((await loginFrom('2001:db8:1:2::ffff', STUDENT_PASSWORD)).statusCode).toBe(429);
    // Mạng khác thì không bị ảnh hưởng.
    expect((await loginFrom('2001:db8:9:9::1', STUDENT_PASSWORD)).statusCode).toBe(200);
  });

  it('trần theo IP: dò nhiều tài khoản từ một nguồn thì bị chặn (trần hạ xuống để test)', async () => {
    h = await accountsHarness({ ipFailureRule: { maxFailures: 15, windowMs: 5 * MINUTE } });
    const loginAs = (mssv: string) =>
      h.app.inject({ method: 'POST', url: '/auth/login', remoteAddress: '198.51.100.9', payload: { role: 'student', mssv, password: 'doan-mo-mat-khau' } });
    for (let i = 0; i < 15; i++) expect((await loginAs(`9999${String(i).padStart(4, '0')}`)).statusCode).toBe(401);
    const blocked = await loginAs('99990099');
    expect([blocked.statusCode, errorCode(blocked)]).toEqual([429, 'RATE_LIMITED']);
    // Kích hoạt từ cùng nguồn cũng bị chặn.
    const act = await h.app.inject({
      method: 'POST',
      url: '/auth/activate',
      remoteAddress: '198.51.100.9',
      payload: { mssv: '20210001', activationCode: 'AAAA-BBBB-CCCC', newPassword: 'mat-khau-moi-1' },
    });
    expect(errorCode(act)).toBe('RATE_LIMITED');
  });

  it('kích hoạt sai 10 lần thì bị chặn', async () => {
    h = await accountsHarness();
    const { '20210001': an } = await importStudents(await h.loginLecturer());
    for (let i = 0; i < 10; i++) await activate('20210001', 'AAAA-BBBB-CCCC');
    expect(errorCode(await activate('20210001', an!.code))).toBe('RATE_LIMITED');
  });
});

describe('phiên đăng nhập', () => {
  it('đăng xuất thu hồi token; gọi lại hoặc không có token vẫn 204', async () => {
    h = await accountsHarness();
    const token = await h.loginLecturer();
    expect((await h.call('POST', '/auth/logout', { token })).statusCode).toBe(204);
    expect((await h.call('GET', '/me', { token })).statusCode).toBe(401);
    expect((await h.call('POST', '/auth/logout', { token })).statusCode).toBe(204);
    expect((await h.call('POST', '/auth/logout')).statusCode).toBe(204);
  });

  it('hạn trượt 30 ngày: dùng đều thì không hết hạn, bỏ 30 ngày thì hết', async () => {
    h = await accountsHarness();
    const token = await h.loginLecturer();
    h.clock.advance(20 * DAY);
    expect((await h.call('GET', '/me', { token })).statusCode).toBe(200);
    h.clock.advance(20 * DAY);
    expect((await h.call('GET', '/me', { token })).statusCode).toBe(200);
    h.clock.advance(30 * DAY);
    expect((await h.call('GET', '/me', { token })).statusCode).toBe(401);
    expect(h.db.prepare('SELECT COUNT(*) AS n FROM sessions').get()).toEqual({ n: 0 });
  });
});

describe('log', () => {
  it('không ghi token, mật khẩu hay mã kích hoạt', async () => {
    let logs = '';
    const stream = new Writable({
      write(chunk, _encoding, done) {
        logs += String(chunk);
        done();
      },
    });
    h = await accountsHarness({ logStream: stream, logLevel: 'trace' });
    const gv = await h.loginLecturer();
    const { '20210001': an } = await importStudents(gv);
    const sv = SessionSchema.parse((await activate('20210001', an!.code)).json()).token;
    await h.call('GET', '/me', { token: sv });
    await h.call('GET', '/me', { token: 'token-sai' });

    expect(logs.length).toBeGreaterThan(0);
    for (const secret of [gv, sv, an!.code, LECTURER.password, STUDENT_PASSWORD, 'mat-khau-relay-test']) {
      expect(logs).not.toContain(secret);
    }
  });
});
