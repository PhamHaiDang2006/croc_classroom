import type { FormEvent } from "react";
import type {
  LecturerAssignmentDetail,
  PayloadSelection,
  Student,
  StudentAssignmentDetail,
} from "@croc-classroom/shared";
import { size, unwrap, type Ctx, type ModalKind } from "./common.js";
import { Modal } from "./ui.js";

/** Các hộp thoại của Workspace: tạo bài, xoá bài, đổi hạn nộp, nhập CSV, xoá cache. */
export function WorkspaceModal({
  ctx: { api, demo, busy, run, setMessage, setModal, refresh },
  modal,
  error,
  selected,
  detail,
  selection,
  pick,
  create,
  setStudents,
}: {
  ctx: Ctx;
  modal: ModalKind;
  error: string;
  selected: string;
  detail: LecturerAssignmentDetail | StudentAssignmentDetail | null;
  selection: PayloadSelection | null;
  pick: () => Promise<void>;
  create: (e: FormEvent<HTMLFormElement>) => Promise<void>;
  setStudents: (students: Student[]) => void;
}) {
  return (
    <Modal
      title={
        modal === "create"
          ? "Tạo bài tập mới"
          : modal === "delete"
            ? "Xoá bài tập này?"
            : modal === "import"
              ? "Nhập danh sách sinh viên"
              : modal === 'cache' ? 'Xoá cache chia sẻ?' : "Thay đổi hạn nộp"
      }
      close={() => {
        if (!busy) setModal(null);
      }}
    >
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {modal === 'cache' && <><p>Các đề đã lưu để chia sẻ sẽ bị xoá khỏi cache. Bạn có thể nhận lại đề khi cần.</p><button className="primary" disabled={busy} onClick={() => void run(async () => { await unwrap(api.invoke('cache.clear', {})); setModal(null); setMessage('Đã xoá cache chia sẻ.'); await refresh(); })}>Xác nhận xoá cache</button></>}
      {modal === "create" && (
        <form onSubmit={create}>
          <label>
            Tên bài tập
            <input
              name="title"
              required
              maxLength={200}
              autoFocus
              placeholder="Ví dụ: Bài tập 3 — Cây nhị phân"
            />
          </label>
          <label>
            Mô tả
            <textarea name="description" rows={3} />
          </label>
          <label>
            Hạn nộp (không bắt buộc)
            <input type="datetime-local" name="deadline" />
          </label>
          <div className="payload-picker">
            <p>
              {selection
                ? `${selection.label} · ${selection.fileCount} file · ${size(selection.totalSize)}`
                : "Chọn thư mục chứa bộ đề cần giao."}
            </p>
            <button
              type="button"
              disabled={busy}
              onClick={() => void pick()}
            >
              Chọn thư mục đề
            </button>
            {demo && (
              <small>
                Xem thử sử dụng bộ file mẫu, không mở hộp thoại máy tính.
              </small>
            )}
          </div>
          <button className="primary" disabled={busy || !selection}>
            {busy ? "Đang tạo…" : "Tạo và tải đề lên"}
          </button>
        </form>
      )}
      {modal === "delete" && (
        <>
          <p>
            Đề và toàn bộ bài nộp của bài tập này sẽ bị xoá. Không thể hoàn
            tác.
          </p>
          <div className="actions">
            <button onClick={() => setModal(null)} disabled={busy}>
              Giữ bài tập
            </button>
            <button
              className="primary"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await unwrap(
                    api.invoke("assignments.delete", {
                      assignmentId: selected,
                    }),
                  );
                  setModal(null);
                  await refresh();
                })
              }
            >
              Xác nhận xoá
            </button>
          </div>
        </>
      )}
      {modal === "deadline" && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const value = String(
              new FormData(e.currentTarget).get("deadline") ?? "",
            );
            void run(async () => {
              await unwrap(
                api.invoke("assignments.update", {
                  assignmentId: selected,
                  changes: {
                    deadlineAt: value
                      ? new Date(value).toISOString()
                      : null,
                  },
                }),
              );
              setModal(null);
              await refresh();
            });
          }}
        >
          <p>Để trống để bỏ hạn nộp. Thời gian theo múi giờ máy của bạn.</p>
          <label>
            Hạn mới
            <input name="deadline" type="datetime-local" defaultValue={detail?.deadlineAt ? new Date(new Date(detail.deadlineAt).getTime() - new Date(detail.deadlineAt).getTimezoneOffset() * 60000).toISOString().slice(0, 16) : ''}/>
          </label>
          <button disabled={busy} className="primary">
            Lưu hạn nộp
          </button>
        </form>
      )}
      {modal === "import" && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const csv = String(new FormData(e.currentTarget).get("csv"));
            void run(async () => {
              const result = await unwrap(
                api.invoke("students.import", { csv }),
              );
              if (result.errors.length)
                throw new Error(
                  result.errors
                    .map((row) => `Dòng ${row.line}: ${row.message}`)
                    .join("; "),
                );
              const output = [
                "mssv,ma_kich_hoat",
                ...result.created.map(
                  (row) =>
                    `${row.student.mssv},${row.activation.activationCode}`,
                ),
              ].join("\n");
              if (result.created.length) {
                const saved = await unwrap(
                  api.invoke("file.saveText", {
                    suggestedName: "ma-kich-hoat.csv",
                    content: output,
                  }),
                );
                setMessage(
                  `${demo ? "Kết quả mẫu: " : ""}${result.created.length} tài khoản; ${result.skipped.length} dòng bỏ qua. ${saved.saved ? "Đã yêu cầu lưu mã kích hoạt." : "Chưa lưu mã kích hoạt: " + output}`,
                );
              } else setMessage("Không có tài khoản mới.");
              setStudents(await unwrap(api.invoke("students.list")));
              setModal(null);
            });
          }}
        >
          <label>
            Nội dung CSV
            <textarea
              name="csv"
              required
              rows={7}
              placeholder={"mssv,ho_ten,lop\n20210004,Nguyễn Văn An,CNTT"}
            />
          </label>
          {demo && (
            <p className="hint">
              Mock trả kết quả mẫu cố định; không nhập tài khoản thật.
            </p>
          )}
          <button className="primary" disabled={busy}>
            Nhập và xuất mã kích hoạt
          </button>
        </form>
      )}
    </Modal>
  );
}
