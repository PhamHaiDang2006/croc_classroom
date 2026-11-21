import type { Db } from '../db/index.js';
import { appError } from '../http/errors.js';

// One server process / Db connection. D must use this same gate for fetch/cleanup.
// Never hold a SQLite transaction across await or await a callback from inside an issuer.
const queues = new WeakMap<Db, Map<string, Promise<void>>>();

export async function withAssignmentLock<T>(db: Db, id: string, work: () => Promise<T>): Promise<T> {
  let queue = queues.get(db);
  if (!queue) queues.set(db, (queue = new Map()));
  const previous = queue.get(id) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => { release = resolve; });
  queue.set(id, current);
  await previous;
  try {
    return await work();
  } finally {
    release();
    if (queue.get(id) === current) queue.delete(id);
  }
}

export function assignmentAvailable(db: Db, id: string): boolean {
  return db.prepare('SELECT 1 FROM assignments WHERE id = ? AND deleting = 0').get(id) !== undefined;
}

export function requireAvailableAssignment(db: Db, id: string): void {
  if (!assignmentAvailable(db, id)) throw appError('NOT_FOUND', 'Bài không tồn tại hoặc đang được xoá');
}

/** D runs this under withAssignmentLock, deletes the payload, then removes the GC row.
 * The durable row survives callback retries/restarts. Never delete an active collect's files.
 */
export function pendingPayloadCleanup(db: Db, assignmentId: string): { storage_ref: string }[] {
  return db.prepare(`SELECT g.storage_ref FROM payload_gc g WHERE g.assignment_id = ?
    AND NOT EXISTS (SELECT 1 FROM tickets t WHERE t.submission_id = g.submission_id
      AND t.kind = 'gv_thu_bai' AND t.status IN ('cho', 'dang_chay'))`).all(assignmentId) as { storage_ref: string }[];
}
