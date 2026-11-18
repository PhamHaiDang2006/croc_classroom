import { appError } from './http/errors.js';
import type { TicketIssuer } from './ports/transfers.js';

/**
 * TicketIssuer dùng khi server chưa có dịch vụ vé + VPS worker của D.
 * Mọi yêu cầu mở lượt truyền trả 503 với thông báo rõ ràng; xoá bài không có gì để dọn trên VPS.
 * Thay bằng triển khai thật của D khi tích hợp (index.ts).
 */
const unavailable = async (): Promise<never> => {
  throw appError('CAPACITY_EXHAUSTED', 'Server chưa có dịch vụ truyền file (chờ tích hợp VPS worker)');
};

export const unavailableTicketIssuer: TicketIssuer = {
  openUpload: unavailable,
  openSubmission: unavailable,
  openCollect: unavailable,
  purgeAssignment: async () => {},
};
