import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { migrate, openDatabase, schemaVersion } from '../src/db/index.js';
import { migrations } from '../src/db/migrations.js';

const now = '2026-11-17T08:00:00.000Z';

function insertUser(db: ReturnType<typeof openDatabase>, values: Record<string, unknown>) {
  const row = { username: null, mssv: null, class_label: null, created_at: now, full_name: 'Tên', ...values };
  db.prepare(
    `INSERT INTO users (id, role, username, mssv, full_name, class_label, created_at)
     VALUES (@id, @role, @username, @mssv, @full_name, @class_label, @created_at)`,
  ).run(row);
}

describe('migration', () => {
  it('tạo đủ bảng của system-design mục 9 và ghi phiên bản schema', () => {
    const db = openDatabase(':memory:');
    expect(migrate(db)).toEqual(migrations.map((m) => m.id));
    expect(schemaVersion(db)).toBe(migrations.at(-1)!.id);
    const tables = db
      .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name`)
      .all()
      .map((r) => (r as { name: string }).name);
    expect(tables).toEqual(['assignments', 'holdings', 'participants', 'sessions', 'submissions', 'tickets', 'users']);
  });

  it('chạy lại không làm gì; từ chối CSDL mới hơn mã nguồn', () => {
    const db = openDatabase(':memory:');
    migrate(db);
    expect(migrate(db)).toEqual([]);
    db.pragma('user_version = 999');
    expect(() => migrate(db)).toThrow(/mới hơn/);
  });

  it('bật WAL và khoá ngoại với file thật', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'croc-db-'));
    try {
      const db = openDatabase(join(dir, 'db', 'test.sqlite'));
      expect(db.pragma('journal_mode', { simple: true })).toBe('wal');
      expect(db.pragma('foreign_keys', { simple: true })).toBe(1);
      db.close();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe('ràng buộc dữ liệu', () => {
  it('chỉ cho phép một giảng viên', () => {
    const db = openDatabase(':memory:');
    migrate(db);
    insertUser(db, { id: 'gv-1', role: 'lecturer', username: 'gv1' });
    expect(() => insertUser(db, { id: 'gv-2', role: 'lecturer', username: 'gv2' })).toThrow(/UNIQUE/);
  });

  it('GV phải có username, SV phải có MSSV; MSSV không trùng', () => {
    const db = openDatabase(':memory:');
    migrate(db);
    expect(() => insertUser(db, { id: 'x', role: 'student', username: 'sv' })).toThrow(/CHECK/);
    insertUser(db, { id: 'sv-1', role: 'student', mssv: '20210001' });
    expect(() => insertUser(db, { id: 'sv-2', role: 'student', mssv: '20210001' })).toThrow(/UNIQUE/);
  });

  it('xoá bài thì xoá dây chuyền tham gia, bài nộp, vé', () => {
    const db = openDatabase(':memory:');
    migrate(db);
    insertUser(db, { id: 'sv-1', role: 'student', mssv: '20210001' });
    db.prepare(
      `INSERT INTO assignments (id, title, code_phrase, status, manifest_json, total_size, file_count, created_at)
       VALUES ('a-1', 'Bài 1', 'sao-mai-xanh-042', 'da_phat_hanh', '{}', 1, 1, ?)`,
    ).run(now);
    db.prepare(`INSERT INTO participants (assignment_id, student_id, joined_at) VALUES ('a-1', 'sv-1', ?)`).run(now);
    db.prepare(
      `INSERT INTO submissions (id, assignment_id, student_id, version, received_at, is_late, total_size, file_count, manifest_json, manifest_hash)
       VALUES ('s-1', 'a-1', 'sv-1', 1, ?, 0, 1, 1, '{}', 'h')`,
    ).run(now);
    db.prepare(
      `INSERT INTO tickets (id, kind, assignment_id, sender_kind, sender_user_id, receiver_kind, status, bytes, created_at, expires_at)
       VALUES ('t-1', 'nop_bai', 'a-1', 'user', 'sv-1', 'vps', 'xong', 1, ?, ?)`,
    ).run(now, now);

    db.prepare(`DELETE FROM assignments WHERE id = 'a-1'`).run();

    for (const table of ['participants', 'submissions', 'tickets']) {
      expect(db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get()).toEqual({ n: 0 });
    }
  });

  it('vé gửi từ người dùng phải có sender_user_id', () => {
    const db = openDatabase(':memory:');
    migrate(db);
    db.prepare(
      `INSERT INTO assignments (id, title, code_phrase, status, manifest_json, total_size, file_count, created_at)
       VALUES ('a-1', 'Bài 1', 'sao-mai-xanh-042', 'da_phat_hanh', '{}', 1, 1, ?)`,
    ).run(now);
    expect(() =>
      db
        .prepare(
          `INSERT INTO tickets (id, kind, assignment_id, sender_kind, receiver_kind, status, bytes, created_at, expires_at)
           VALUES ('t-1', 'phat_de', 'a-1', 'user', 'vps', 'cho', 1, ?, ?)`,
        )
        .run(now, now),
    ).toThrow(/CHECK/);
  });
});
