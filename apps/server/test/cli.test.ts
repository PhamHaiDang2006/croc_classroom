import { describe, expect, it } from 'vitest';
import { parseArgs, runCli, type CliIo } from '../src/cli.js';
import { testDb } from './helpers.js';

function fakeIo(passwords: string[]): CliIo & { output: string[]; errors: string[] } {
  const queue = [...passwords];
  const output: string[] = [];
  const errors: string[] = [];
  return {
    output,
    errors,
    readPassword: async () => queue.shift() ?? '',
    out: (line) => output.push(line),
    err: (line) => errors.push(line),
  };
}

describe('parseArgs', () => {
  it('đọc --khoa giatri và --khoa=giatri', () => {
    expect(parseArgs(['create-lecturer', '--username', 'giangvien', '--full-name=Nguyễn Văn A'])).toEqual({
      command: 'create-lecturer',
      options: { username: 'giangvien', 'full-name': 'Nguyễn Văn A' },
    });
    expect(() => parseArgs(['x', '--username'])).toThrow(/Thiếu giá trị/);
    expect(() => parseArgs(['x', 'lung-tung'])).toThrow(/không hiểu/);
  });
});

describe('lệnh CLI', () => {
  it('create-lecturer tạo đúng một GV; lần hai báo lỗi', async () => {
    const db = testDb();
    const io = fakeIo(['mat-khau-gv-1', 'mat-khau-gv-1']);
    expect(await runCli(['create-lecturer', '--username', 'giangvien', '--full-name', 'Nguyễn Văn Giảng'], io, db)).toBe(0);
    expect(io.output[0]).toMatch(/giangvien/);
    expect(db.prepare(`SELECT username, full_name FROM users WHERE role = 'lecturer'`).get()).toEqual({
      username: 'giangvien',
      full_name: 'Nguyễn Văn Giảng',
    });

    const again = fakeIo(['mat-khau-gv-2', 'mat-khau-gv-2']);
    expect(await runCli(['create-lecturer', '--username', 'gv2', '--full-name', 'Khác'], again, db)).toBe(1);
    expect(again.errors[0]).toMatch(/chỉ có một/);
  });

  it('báo lỗi khi mật khẩu không khớp, quá ngắn hoặc thiếu tham số', async () => {
    const db = testDb();
    const mismatch = fakeIo(['mat-khau-gv-1', 'khac-hoan-toan']);
    expect(await runCli(['create-lecturer', '--username', 'giangvien', '--full-name', 'A'], mismatch, db)).toBe(1);
    expect(mismatch.errors[0]).toMatch(/không khớp/);

    const short = fakeIo(['ngan', 'ngan']);
    expect(await runCli(['create-lecturer', '--username', 'giangvien', '--full-name', 'A'], short, db)).toBe(1);
    expect(short.errors[0]).toMatch(/tối thiểu 8/);

    const badName = fakeIo(['mat-khau-gv-1', 'mat-khau-gv-1']);
    expect(await runCli(['create-lecturer', '--username', 'gv', '--full-name', 'A'], badName, db)).toBe(1);
    expect(badName.errors[0]).toMatch(/Tên đăng nhập 3–64 ký tự/);

    const missing = fakeIo([]);
    expect(await runCli(['create-lecturer', '--username', 'gv'], missing, db)).toBe(1);
    expect(db.prepare('SELECT COUNT(*) AS n FROM users').get()).toEqual({ n: 0 });
  });

  it('reset-lecturer-password đổi mật khẩu và đăng xuất mọi phiên GV', async () => {
    const db = testDb();
    await runCli(['create-lecturer', '--username', 'giangvien', '--full-name', 'A'], fakeIo(['mat-khau-cu-1', 'mat-khau-cu-1']), db);
    const oldHash = (db.prepare(`SELECT password_hash FROM users`).get() as { password_hash: string }).password_hash;
    const userId = (db.prepare(`SELECT id FROM users`).get() as { id: string }).id;
    db.prepare(
      `INSERT INTO sessions (id, user_id, token_hash, created_at, last_seen_at, expires_at) VALUES ('s', ?, 'h', 'x', 'x', 'x')`,
    ).run(userId);

    expect(await runCli(['reset-lecturer-password'], fakeIo(['mat-khau-moi-1', 'mat-khau-moi-1']), db)).toBe(0);
    expect((db.prepare(`SELECT password_hash FROM users`).get() as { password_hash: string }).password_hash).not.toBe(oldHash);
    expect(db.prepare('SELECT COUNT(*) AS n FROM sessions').get()).toEqual({ n: 0 });
  });

  it('reset khi chưa có GV, lệnh lạ, không có lệnh → mã thoát 1', async () => {
    const db = testDb();
    const io = fakeIo(['mat-khau-moi-1', 'mat-khau-moi-1']);
    expect(await runCli(['reset-lecturer-password'], io, db)).toBe(1);
    expect(io.errors[0]).toMatch(/create-lecturer/);
    expect(await runCli(['xoa-het'], fakeIo([]), db)).toBe(1);
    expect(await runCli([], fakeIo([]), db)).toBe(1);
  });
});
