import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import Database from 'better-sqlite3';
import { migrations as defaultMigrations, type Migration } from './migrations.js';

export type Db = Database.Database;

/** Mở SQLite: bật WAL, khoá ngoại, chờ khi bận. Tạo thư mục cha nếu cần. */
export function openDatabase(path: string): Db {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path);
  if (path !== ':memory:') db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  db.pragma('synchronous = NORMAL');
  return db;
}

export function schemaVersion(db: Db): number {
  return db.pragma('user_version', { simple: true }) as number;
}

/** Áp dụng các migration chưa chạy, mỗi migration trong một transaction. Trả về danh sách id đã áp dụng. */
export function migrate(db: Db, migrations: readonly Migration[] = defaultMigrations): number[] {
  const sorted = [...migrations].sort((a, b) => a.id - b.id);
  const current = schemaVersion(db);
  const latest = sorted.at(-1)?.id ?? 0;
  if (current > latest) {
    throw new Error(`CSDL ở phiên bản schema ${current}, mới hơn mã nguồn (${latest}). Không hạ cấp.`);
  }
  const applied: number[] = [];
  for (const migration of sorted) {
    if (migration.id <= current) continue;
    db.transaction(() => {
      db.exec(migration.sql);
      db.pragma(`user_version = ${migration.id}`);
    })();
    applied.push(migration.id);
  }
  return applied;
}
