import { ERROR_HTTP_STATUS, type ApiErrorBody, type ApiErrorCode } from '@croc-classroom/shared';

/** Lỗi nghiệp vụ có mã trong hợp đồng. Module ném AppError; error handler chuyển thành ApiErrorBody. */
export class AppError extends Error {
  constructor(
    readonly code: ApiErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }

  get httpStatus(): number {
    return ERROR_HTTP_STATUS[this.code];
  }

  toBody(): ApiErrorBody {
    return {
      error: {
        code: this.code,
        message: this.message,
        ...(this.details === undefined ? {} : { details: this.details }),
      },
    };
  }
}

/** Thông báo mặc định (tiếng Việt) cho từng mã lỗi. */
export const DEFAULT_ERROR_MESSAGES: Record<ApiErrorCode, string> = {
  VALIDATION_FAILED: 'Dữ liệu gửi lên không hợp lệ',
  UNAUTHENTICATED: 'Chưa đăng nhập hoặc phiên đã hết hạn',
  FORBIDDEN: 'Không có quyền thực hiện thao tác này',
  NOT_FOUND: 'Không tìm thấy',
  CONFLICT: 'Xung đột dữ liệu',
  RATE_LIMITED: 'Thử quá nhiều lần, vui lòng chờ',
  PAYLOAD_TOO_LARGE: 'Dữ liệu quá lớn',
  INTERNAL: 'Lỗi máy chủ',
  INVALID_CREDENTIALS: 'Sai tài khoản hoặc mật khẩu',
  ACCOUNT_DISABLED: 'Tài khoản đã bị vô hiệu hoá',
  ACCOUNT_NOT_ACTIVATED: 'Tài khoản chưa kích hoạt',
  ACTIVATION_INVALID: 'Mã kích hoạt không đúng hoặc đã hết hạn',
  CODE_PHRASE_INVALID: 'Code không đúng',
  ASSIGNMENT_FULL: 'Bài tập đã đủ số sinh viên',
  ASSIGNMENT_ALREADY_PUBLISHED: 'Bài tập đã phát hành',
  NOT_PARTICIPANT: 'Bạn chưa tham gia bài tập này',
  MANIFEST_INVALID: 'Danh sách file không hợp lệ',
  CAPACITY_EXHAUSTED: 'Máy chủ đang bận, vui lòng thử lại sau',
  TICKET_STATE_INVALID: 'Lượt truyền không còn ở trạng thái phù hợp',
  SUBMISSION_SUPERSEDED: 'Đã có bản nộp mới hơn',
};

export function appError(code: ApiErrorCode, message?: string, details?: unknown): AppError {
  return new AppError(code, message ?? DEFAULT_ERROR_MESSAGES[code], details);
}
