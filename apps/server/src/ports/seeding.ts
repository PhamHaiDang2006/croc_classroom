/**
 * Số máy đang online và chia sẻ đề của một bài (kể cả GV) — dùng cho thống kê `stats.seeding`.
 * Trạng thái seeder nằm trong bộ nhớ của distribution (D); D triển khai interface này.
 * Đề xuất của C ở M2, chờ D review.
 */
export interface SeedingStats {
  seedingCount(assignmentId: string): number;
}

/** Dùng khi chưa có distribution: luôn 0. */
export const noSeedingStats: SeedingStats = { seedingCount: () => 0 };
