import type { IssuedTicket, Manifest, Receipt } from '@croc-classroom/shared';

/**
 * Interface nội bộ giữa nghiệp vụ (C: assignments, submissions) và dịch vụ vé + VPS worker (D).
 * Đề xuất của bootstrap — D quản lý, C review. Chưa chốt.
 *
 * Nguyên tắc:
 * - C không chạy croc, không tự tạo vé hay hàng đợi; chỉ gọi TicketIssuer.
 * - D không tự ghi dữ liệu nghiệp vụ (bài tập, bài nộp); báo kết quả qua TransferOutcomeHandler.
 * - Chỉ worker xác nhận VPS đã lưu file đúng manifest. Báo cáo của client (người gửi) không đủ.
 * - Mỗi (bên nhận, bài, loại vé) có tối đa một vé chưa kết thúc: mở vé mới thì vé cũ chuyển `huy`
 *   với lý do `superseded`.
 * - Hết chỗ trong bể tiến trình VPS: ném AppError('CAPACITY_EXHAUSTED', …, { retryAfterSeconds }).
 */
export interface TicketIssuer {
  /** gv_tai_len: VPS mở croc nhận vào thư mục tạm; trả vé cho GV gửi đề. */
  openUpload(request: { assignmentId: string; lecturerId: string; manifest: Manifest; totalBytes: number }): Promise<IssuedTicket>;

  /** nop_bai: VPS mở croc nhận bài nộp. */
  openSubmission(request: { assignmentId: string; studentId: string; manifest: Manifest; totalBytes: number }): Promise<IssuedTicket>;

  /**
   * gv_thu_bai: VPS gửi đúng phiên bản `submissionId` từ `storageRef`. File của phiên bản đang được
   * thu phải còn nguyên đến khi vé kết thúc, kể cả khi SV nộp bản mới trong lúc đó.
   */
  openCollect(request: {
    assignmentId: string;
    submissionId: string;
    lecturerId: string;
    storageRef: string;
    manifest: Manifest;
    totalBytes: number;
  }): Promise<IssuedTicket>;

  /** Xoá bài: huỷ mọi vé chưa kết thúc, báo seeder ngừng chia sẻ, xoá file đề và bài nộp trên VPS. */
  purgeAssignment(assignmentId: string): Promise<void>;
}

export type SubmissionCommitResult =
  | { accepted: true; receipt: Receipt }
  /** Vé đã bị huỷ/thay thế trong lúc worker xác minh: worker xoá bản vừa lưu. */
  | { accepted: false; reason: 'ticket_not_active' };

/** C triển khai; D (worker/dịch vụ vé) gọi khi một lượt truyền kết thúc. */
export interface TransferOutcomeHandler {
  /**
   * Worker đã nhận đủ đề và xác minh theo manifest, đã chuyển vào kho tại `storageRef`. C chuyển bài sang
   * `da_phat_hanh` (gọi lặp thì không làm gì; bài đã bị xoá thì bỏ qua). Sau khi hàm trả về, D gửi WS
   * `assignment.published` cho GV và ghi `holdings` cho GV (GV là seeder của bài).
   */
  onUploadStored(event: { ticketId: string; assignmentId: string; storageRef: string; verifiedAt: string }): Promise<void>;

  /**
   * SV (bên nhận vé `phat_de`) đã báo xác minh xong đề. C ghi `participants.received_at/received_from`
   * (lần đầu; báo lại không ghi đè). D tự ghi `holdings` của SV. Bổ sung ở M2, chờ D review.
   */
  onFetchVerified(event: {
    ticketId: string;
    assignmentId: string;
    studentId: string;
    source: 'vps' | 'peer' | 'lecturer';
    verifiedAt: string;
  }): Promise<void>;

  /**
   * Worker đã nhận và xác minh bài nộp, đã chuyển vào kho tại `storageRef`. C, trong một transaction:
   * kiểm tra vé còn `dang_chay`, gán version = version lớn nhất + 1, tính cờ trễ theo `verifiedAt`,
   * ghi dòng submissions, đánh dấu phiên bản trước không còn file. Trả biên nhận để D gửi cho SV
   * (WS ticket.updated) và báo GV (WS submission.new).
   */
  onSubmissionStored(event: {
    ticketId: string;
    assignmentId: string;
    studentId: string;
    manifest: Manifest;
    manifestHash: string;
    totalBytes: number;
    storageRef: string;
    verifiedAt: string;
  }): Promise<SubmissionCommitResult>;

  /** GV (bên nhận vé gv_thu_bai) báo đã tải về và xác minh. C ghi collected_at cho đúng phiên bản. */
  onCollectConfirmed(event: { ticketId: string; submissionId: string; confirmedAt: string }): Promise<void>;
}
