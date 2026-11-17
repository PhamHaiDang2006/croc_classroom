import type { Receipt } from '@croc-classroom/shared';
import type { Db } from '../db/index.js';

/** Dòng bảng `submissions` (mỗi dòng là một phiên bản đã xác minh). */
export interface SubmissionRow {
  id: string;
  assignment_id: string;
  student_id: string;
  version: number;
  received_at: string;
  is_late: number;
  total_size: number;
  file_count: number;
  manifest_json: string;
  manifest_hash: string;
  storage_ref: string | null;
  collected_at: string | null;
}

export function toReceipt(row: SubmissionRow): Receipt {
  return {
    submissionId: row.id,
    assignmentId: row.assignment_id,
    version: row.version,
    receivedAt: row.received_at,
    isLate: row.is_late === 1,
    totalSize: row.total_size,
    fileCount: row.file_count,
    manifestHash: row.manifest_hash,
  };
}

/** Biên nhận bản nộp mới nhất của một SV cho một bài; null nếu chưa nộp. */
export function latestReceipt(db: Db, assignmentId: string, studentId: string): Receipt | null {
  const row = db
    .prepare(
      `SELECT * FROM submissions WHERE assignment_id = ? AND student_id = ?
       ORDER BY version DESC LIMIT 1`,
    )
    .get(assignmentId, studentId) as SubmissionRow | undefined;
  return row ? toReceipt(row) : null;
}
