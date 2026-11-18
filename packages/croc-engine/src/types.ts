/**
 * Interface croc-engine v1 — đề xuất của bootstrap. B quản lý và triển khai; D (VPS worker) và
 * main process (B) là bên dùng. Chờ B/D review trước khi coi là đã chốt.
 *
 * Hợp đồng ngữ nghĩa:
 * - Đây là nơi DUY NHẤT chạy croc và đọc đầu ra của croc.
 * - Mỗi lượt truyền (send/receive) là một tiến trình croc riêng, có timeout bắt buộc.
 * - Gốc bộ file (payload root): `send` gửi NỘI DUNG của `payloadDir`; sau `receive` thành công,
 *   các file nằm ngay dưới `outDir` theo đúng đường dẫn tương đối trong manifest. B định nghĩa cách
 *   làm với croc (ví dụ thư mục bọc ngoài) và giữ quy ước này ở mọi nơi.
 * - `receive` không bao giờ ghi ra ngoài `outDir` (kiểm tra sau khi nhận, lỗi PATH_ESCAPE).
 * - `done` không bao giờ reject: luôn resolve TransferResult.
 * - `cancel()` và timeout dừng cả cây tiến trình con (kể cả trên Windows) trước khi `done` resolve.
 * - Engine không xác minh manifest; bên gọi tự xác minh (shared/node verifyDirectory).
 */

export interface RelayConfig {
  /** `host:port`, ví dụ `relay.example.com:9009`. */
  address: string;
  password: string;
}

export interface SendOptions {
  payloadDir: string;
  /** Code croc dùng một lần do server cấp. Không ghi log. */
  code: string;
  relay: RelayConfig;
  timeoutMs: number;
}

export interface ReceiveOptions {
  code: string;
  /** Thư mục tạm rỗng; bên gọi tạo trước và dọn khi lỗi. */
  outDir: string;
  relay: RelayConfig;
  timeoutMs: number;
  /** Dừng và báo SIZE_LIMIT_EXCEEDED khi đã nhận quá số byte này. */
  maxBytes?: number;
}

export interface TransferProgress {
  bytesDone: number;
  /** null nếu croc chưa báo tổng dung lượng. */
  bytesTotal: number | null;
}

export const ENGINE_ERROR_CODES = [
  'TIMEOUT',
  'CANCELLED',
  'PEER_DISCONNECTED',
  'RELAY_UNREACHABLE',
  'RELAY_AUTH_FAILED',
  'SIZE_LIMIT_EXCEEDED',
  'PATH_ESCAPE',
  'CROC_NOT_FOUND',
  'CROC_FAILED',
] as const;
export type EngineErrorCode = (typeof ENGINE_ERROR_CODES)[number];

export interface EngineError {
  code: EngineErrorCode;
  message: string;
}

export type TransferResult = { ok: true; bytes: number } | { ok: false; error: EngineError };

export interface Transfer {
  readonly done: Promise<TransferResult>;
  /** Đăng ký nhận tiến trình; trả về hàm huỷ đăng ký. */
  onProgress(listener: (progress: TransferProgress) => void): () => void;
  /** Huỷ lượt truyền. Gọi nhiều lần hoặc sau khi xong không có tác dụng. */
  cancel(): void;
}

export interface CrocEngine {
  send(options: SendOptions): Transfer;
  receive(options: ReceiveOptions): Transfer;
  /**
   * Sinh code croc dùng một lần (≥ 128 bit, bộ sinh số ngẫu nhiên an toàn mật mã) đúng định dạng
   * croc chấp nhận. Đặt ở đây vì định dạng phụ thuộc croc. B cần kiểm chứng cách relay chia phòng
   * theo code để nhiều lượt chạy song song không đụng phòng nhau.
   */
  generateCode(): string;
}
