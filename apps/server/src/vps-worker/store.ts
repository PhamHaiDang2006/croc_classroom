import { mkdir, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { IdSchema } from '@croc-classroom/shared';
import type { Db } from '../db/index.js';
import { pendingPayloadCleanup, withAssignmentLock } from '../ports/assignment-lifecycle.js';

/** Kho file trên VPS: `<root>/<bài>/<storageRef>/…` (đề và bài nộp). */
export class PayloadStore {
  constructor(
    readonly db: Db,
    readonly root: string,
  ) {}

  path(assignment: string, ref: string) {
    return join(this.root, IdSchema.parse(assignment), IdSchema.parse(ref));
  }

  async create(assignment: string, ref: string) {
    await mkdir(join(this.root, IdSchema.parse(assignment)), { recursive: true });
    const dir = this.path(assignment, ref);
    await mkdir(dir);
    return dir;
  }

  remove(assignment: string, ref: string) {
    return rm(this.path(assignment, ref), { recursive: true, force: true });
  }

  purge(assignment: string) {
    return rm(join(this.root, IdSchema.parse(assignment)), { recursive: true, force: true });
  }

  /** Xoá các bản nộp cũ trong hàng dọn (payload_gc) không còn vé thu bài nào dùng. */
  gc(assignment: string) {
    return withAssignmentLock(this.db, assignment, async () => {
      for (const { storage_ref } of pendingPayloadCleanup(this.db, assignment)) {
        await this.remove(assignment, storage_ref);
        this.db.prepare('DELETE FROM payload_gc WHERE storage_ref=?').run(storage_ref);
      }
    });
  }

  /** Khi khởi động: huỷ vé dở, hoàn tất xoá bài dở, dọn file không còn được tham chiếu. */
  async recover() {
    this.db
      .prepare("UPDATE tickets SET status='huy',failure_reason='server_restart',finished_at=? WHERE status IN ('cho','dang_chay')")
      .run(new Date().toISOString());
    for (const row of this.db.prepare('SELECT id FROM assignments WHERE deleting=1').all() as { id: string }[]) {
      await this.purge(row.id);
      this.db.prepare('DELETE FROM assignments WHERE id=?').run(row.id);
    }
    // Restore verified holders if the process stopped between a committed callback and notification.
    this.db
      .prepare(
        `INSERT OR IGNORE INTO holdings(assignment_id,user_id,verified_at)
         SELECT t.assignment_id,t.sender_user_id,t.finished_at FROM tickets t JOIN assignments a ON a.id=t.assignment_id
         WHERE t.kind='gv_tai_len' AND t.status='xong' AND a.storage_ref=t.id`,
      )
      .run();
    await mkdir(this.root, { recursive: true });
    const referenced = this.db.prepare(
      'SELECT 1 FROM assignments WHERE id=? AND storage_ref=? UNION ALL SELECT 1 FROM submissions WHERE assignment_id=? AND storage_ref=?',
    );
    for (const a of await readdir(this.root, { withFileTypes: true })) {
      if (!a.isDirectory() || !IdSchema.safeParse(a.name).success) continue;
      await this.gc(a.name);
      for (const ref of await readdir(join(this.root, a.name))) {
        if (!IdSchema.safeParse(ref).success) continue;
        if (!referenced.get(a.name, ref, a.name, ref)) await this.remove(a.name, ref);
      }
    }
  }
}
