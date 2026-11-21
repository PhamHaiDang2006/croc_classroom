import type { IssuedTicket, Manifest, Receipt } from '@croc-classroom/shared';

/**
 * Interface nội bộ giữa nghiệp vụ (C: assignments, submissions) và dịch vụ vé + VPS worker (D).
 * Đề xuất của bootstrap — D quản lý, C review. Chưa chốt.
 *
 * Nguyên tắc:
 * - C không chạy croc, không tự tạo vé hay hàng đợi; chỉ gọi TicketIssuer.
 * - D không tự ghi dữ liệu nghiệp vụ (bài tập, bài nộp); báo kết quả qua TransferOutcomeHandler.
 * - Chỉ worker xác nhận VPS đã lưu file đúng manifest. Báo cáo của client (người gửi) không đủ.
 * - D ghi mỗi vé vào bảng `tickets` (trạng thái `dang_chay` khi mở) trước khi trả vé.
 * - Tối đa MỘT vé chưa kết thúc cho mỗi:
 *     gv_tai_len → bài;  nop_bai → (SV gửi, bài);  phat_de → (SV nhận, bài);  gv_thu_bai → phiên bản bài nộp.
 *   Mở vé mới thì vé cũ cùng khoá chuyển `huy` với lý do `superseded`. (GV thu nhiều bài nộp của cùng một
 *   bài song song được vì khoá của gv_thu_bai là phiên bản bài nộp.)
 * - Hết chỗ trong bể tiến trình VPS: ném AppError('CAPACITY_EXHAUSTED', …, { retryAfterSeconds }).
 * - C holds withAssignmentLock while calling open methods or purge. These methods must return after
 *   reserving/cancelling work, not await outcomes (which acquire the same lock).
 * - D's fetch and garbage collection must use this same per-assignment lock and check deleting.
 * - openCollect must persist its active ticket before returning, pinning that submission's files.
 */
export interface TicketIssuer {
  /** gv_tai_len: VPS mở croc nhận vào thư mục tạm; trả vé cho GV gửi đề. */
  openUpload(request: { assignmentId: string; lecturerId: string; manifest: Manifest; totalBytes: number }): Promise<IssuedTicket>;

  /** nop_bai: VPS mở croc nhận bài nộp. D giữ `manifest` để xác minh và trả lại trong onSubmissionStored. */
  openSubmission(request: { assignmentId: string; studentId: string; manifest: Manifest; totalBytes: number }): Promise<IssuedTicket>;

  /**
   * gv_thu_bai: VPS gửi đúng phiên bản `submissionId` từ `storageRef`. File của phiên bản đang được
   * thu phải còn nguyên đến khi vé kết thúc, kể cả khi SV nộp bản mới trong lúc đó.
   * D ghi `tickets.submission_id = submissionId`.
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

export type UploadCommitResult =
  | { accepted: true; alreadyCommitted: boolean; storageRef: string }
  | { accepted: false; reason: 'ticket_not_active' };

export type SubmissionCommitResult =
  | {
      accepted: true;
      receipt: Receipt;
      /**
       * Bản cũ không còn được giữ: D xoá file của các tham chiếu này khi không còn vé gv_thu_bai
       * nào đang dùng chúng. Rỗng khi gọi lặp cho vé đã commit.
       */
      supersededStorageRefs: string[];
    }
  /** Vé đã bị huỷ/thay thế/hết hạn trong lúc worker xác minh: worker xoá bản vừa lưu. */
  | { accepted: false; reason: 'ticket_not_active' };

/** C triển khai; D (worker/dịch vụ vé) gọi khi một lượt truyền kết thúc. */
export interface TransferOutcomeHandler {
  /**
   * Worker đã nhận đủ đề, xác minh và lưu vào kho. C kiểm tra vé đúng bài/loại, còn hoạt động và
   * chưa hết hạn; phát hành và kết thúc vé trong một transaction. Chỉ accepted mới được phát WS/holdings.
   * Gọi lặp trả storageRef đã commit; không xoá ref đó. Kết quả bị từ chối: dọn payload riêng của vé.
   */
  onUploadStored(event: { ticketId: string; assignmentId: string; storageRef: string; verifiedAt: string }): Promise<UploadCommitResult>;

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
   * Worker đã nhận và xác minh bài nộp theo `manifest` (manifest SV khai khi xin vé), đã chuyển vào kho
   * tại `storageRef`. C, trong MỘT transaction:
   * - kiểm tra vé `nop_bai` khớp (bài, SV) và còn `dang_chay` — không thì trả `ticket_not_active`;
   * - gán version = lớn nhất + 1, giờ nộp = `verifiedAt`, cờ trễ theo hạn nộp hiện tại;
   * - tự tính mã băm tổng từ `manifest`, ghi dòng `submissions`;
   * - bỏ `storage_ref` của phiên bản trước (trả về trong `supersededStorageRefs`);
   * - chuyển vé sang `xong` và ghi `tickets.submission_id`.
   * Gọi lặp cho vé đã commit trả lại cùng biên nhận (an toàn khi D thử lại sau lỗi mạng/khởi động lại).
   * Sau khi hàm trả về, D gửi WS `ticket.updated` (kèm biên nhận) cho SV và `submission.new` cho GV.
   */
  onSubmissionStored(event: {
    ticketId: string;
    assignmentId: string;
    studentId: string;
    manifest: Manifest;
    storageRef: string;
    verifiedAt: string;
  }): Promise<SubmissionCommitResult>;

  /**
   * GV (bên nhận vé gv_thu_bai) báo đã tải về và xác minh. C ghi `collected_at` cho đúng phiên bản
   * (lần đầu; báo lại không ghi đè). C kiểm tra vé và chuyển sang `xong` trong cùng transaction.
   * D đọc lại trạng thái vé trước khi gửi WS; callback void không tự chứng minh kết quả được chấp nhận.
   */
  onCollectConfirmed(event: { ticketId: string; submissionId: string; confirmedAt: string }): Promise<void>;
}
