import type { CrocApi, IpcResult, TransferEvent } from "@croc-classroom/shared";

export const date = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat("vi-VN", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(value))
    : "Không có hạn nộp";
export const size = (bytes: number) =>
  bytes < 1024
    ? `${bytes} B`
    : bytes < 1048576
      ? `${(bytes / 1024).toFixed(1)} KB`
      : `${(bytes / 1048576).toFixed(1)} MB`;
export const phases: Record<TransferEvent["phase"], string> = {
  preparing: "Đang chuẩn bị",
  queued: "Đang xếp hàng",
  waiting_source: "Đang chờ nguồn phát",
  transferring: "Đang truyền file",
  verifying: "Đang xác minh file",
  succeeded: "Hoàn tất",
  failed: "Truyền file thất bại",
  cancelled: "Đã huỷ",
  timeout: "Hết thời gian truyền",
};
export const terminal = (event: TransferEvent) =>
  ["succeeded", "failed", "cancelled", "timeout"].includes(event.phase);
export async function unwrap<T>(promise: Promise<IpcResult<T>>): Promise<T> {
  const result = await promise;
  if (!result.ok) throw new Error(result.error.message);
  return result.data;
}

export type Page = "assignments" | "students" | "settings";
export type ModalKind = "create" | "delete" | "import" | "deadline" | "cache";

/** Những thứ mọi màn hình trong Workspace dùng chung. */
export interface Ctx {
  api: CrocApi;
  demo: boolean;
  lecturer: boolean;
  busy: boolean;
  /** Chạy một thao tác: khoá nút, xoá thông báo cũ, hiện lỗi nếu có. */
  run: (work: () => Promise<void>) => Promise<void>;
  setMessage: (message: string) => void;
  setModal: (modal: ModalKind | null) => void;
  /** Tải lại danh sách bài tập. */
  refresh: () => Promise<void>;
}
