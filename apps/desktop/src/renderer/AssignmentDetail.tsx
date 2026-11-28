import type {
  LecturerAssignmentDetail,
  PayloadSelection,
  Receipt,
  StudentAssignmentDetail,
  StudentAssignmentView,
  SubmissionRowView,
  TransferEvent,
} from "@croc-classroom/shared";
import { date, phases, size, unwrap, type Ctx } from "./common.js";

/** Phần chi tiết của bài đang chọn (cột phải màn "Bài tập"). */
export function AssignmentDetail({
  ctx: { api, demo, lecturer, busy, run, setMessage, setModal },
  selected,
  detail,
  currentStudent,
  rows,
  receipt,
  latestTransfer,
  transferring,
  selection,
  pick,
  track,
}: {
  ctx: Ctx;
  selected: string;
  detail: LecturerAssignmentDetail | StudentAssignmentDetail | null;
  currentStudent: StudentAssignmentView | undefined;
  rows: SubmissionRowView[];
  receipt: Receipt | null;
  latestTransfer: TransferEvent | undefined;
  transferring: boolean;
  selection: PayloadSelection | null;
  pick: () => Promise<void>;
  track: (operationId: string, assignmentId: string, kind: TransferEvent["kind"], bytesTotal: number) => void;
}) {
  if (!detail)
    return (
      <div className="empty detail-empty">
        <span className="paper-mark" aria-hidden="true">
          01
        </span>
        <h2>
          {selected
            ? "Đang mở bài tập…"
            : "Một mã. Cả lớp cùng nhận."}
        </h2>
        <p>
          {selected
            ? "Đang lấy thông tin từ lớp học."
            : "Chọn một bài tập để xem đề, theo dõi tiến độ và quản lý bài nộp."}
        </p>
      </div>
    );
  const published = "status" in detail && detail.status === "da_phat_hanh";
  return (
    <>
      <div className="detail-title">
        <span>
          Bài tập /{" "}
          {lecturer
            ? published
              ? "Đã phát hành"
              : "Đang chuẩn bị"
            : "Đã tham gia"}
        </span>
        <h2>{detail.title}</h2>
        <p>
          {detail.description ||
            "Chưa có mô tả cho bài tập này."}
        </p>
      </div>
      {lecturer ? (
        <section
          className={`code-panel ${!published ? "unpublished" : ""}`}
        >
          <div>
            <p>
              {published
                ? "Mã giao bài cho cả lớp"
                : "Đề bài chưa sẵn sàng"}
            </p>
            <strong>
              {published && "codePhrase" in detail
                ? detail.codePhrase
                : "Chờ xác minh file"}
            </strong>
            <p>
              {published
                ? "Sinh viên nhập mã này để nhận đúng bộ đề."
                : "Mã sẽ xuất hiện sau khi máy chủ nhận và xác minh đề."}
            </p>
          </div>
          {published && "codePhrase" in detail && (
            <button
              onClick={() =>
                void run(async () => {
                  await navigator.clipboard.writeText(
                    detail.codePhrase,
                  );
                  setMessage("Đã sao chép mã giao bài.");
                })
              }
            >
              Sao chép mã <span aria-hidden="true">↗</span>
            </button>
          )}
          {!published && (
            <button
              disabled={busy || transferring || demo}
              title={demo ? 'Bản xem thử chưa mô phỏng tải lại đề' : undefined}
              onClick={() =>
                void run(async () => {
                  await unwrap(
                    api.invoke("assignments.retryUpload", {
                      assignmentId: selected,
                    }),
                  );
                  setMessage("Đã yêu cầu tải đề lại.");
                })
              }
            >
              Tải đề lại
            </button>
          )}
        </section>
      ) : (
        <section className="student-action">
          <div>
            <h3>
              {currentStudent?.local.hasWorkCopy
                ? "Đề bài đã ở trên máy bạn."
                : "Sẵn sàng nhận đề bài."}
            </h3>
            <p>
              {currentStudent?.local.hasWorkCopy
                ? "Làm bài trong thư mục riêng, sau đó chọn bộ file để nộp."
                : "File được kiểm tra trước khi đưa vào thư mục làm bài."}
            </p>
          </div>
          <button
            className={currentStudent?.local.hasWorkCopy ? '' : 'primary'}
            disabled={busy || transferring}
            onClick={() =>
              void run(async () => {
                if (currentStudent?.local.hasWorkCopy) {
                  await unwrap(api.invoke('shell.openFolder', { target: 'work', assignmentId: selected }));
                } else {
                  const result = await unwrap(api.invoke('student.fetch', { assignmentId: selected }));
                  track(result.operationId, selected, 'fetch', detail.totalSize);
                }
                if (demo && currentStudent?.local.hasWorkCopy)
                  setMessage(
                    "Xem thử: chưa có thư mục thật để mở.",
                  );
              })
            }
          >
            {currentStudent?.local.hasWorkCopy
              ? "Mở thư mục bài"
              : "Nhận đề bài"}{" "}
            <span aria-hidden="true">↓</span>
          </button>
        </section>
      )}
      <div className="metadata">
        <div>
          <small>Hạn nộp</small>
          <span>{date(detail.deadlineAt)}</span>
        </div>
        <div>
          <small>Bộ đề</small>
          <span>
            {detail.fileCount} file · {size(detail.totalSize)}
          </span>
        </div>
        {lecturer && (
          <button
            className="text-button"
            onClick={() => setModal("deadline")}
          >
            Sửa hạn nộp
          </button>
        )}
      </div>
      {latestTransfer && (
        <section className="transfer" role="status">
          <div>
            <span>
              {latestTransfer.kind === "submit" &&
              latestTransfer.phase === "succeeded" &&
              !latestTransfer.receipt
                ? "Đang chờ biên nhận máy chủ"
                : phases[latestTransfer.phase]}
            </span>
            <span>
              {size(latestTransfer.bytesDone)} /{" "}
              {size(latestTransfer.bytesTotal)}
            </span>
          </div>
          <progress
            max={Math.max(1, latestTransfer.bytesTotal)}
            value={latestTransfer.bytesDone}
          />
          {latestTransfer.queuePosition && (
            <p>
              Vị trí hàng đợi: {latestTransfer.queuePosition}
            </p>
          )}
          {latestTransfer.error && (
            <p className="error">
              {latestTransfer.error.message}
            </p>
          )}
          {transferring && (
            <button
              disabled={busy || demo}
              title={
                demo
                  ? "Mock hiện chưa mô phỏng huỷ tiến trình"
                  : undefined
              }
              onClick={() =>
                void run(async () => {
                  await unwrap(
                    api.invoke("transfer.cancel", {
                      operationId: latestTransfer.operationId,
                    }),
                  );
                })
              }
            >
              Huỷ truyền
            </button>
          )}
        </section>
      )}
      <details className="files">
        <summary>
          Xem {detail.manifest.files.length} file trong đề
        </summary>
        {detail.manifest.files.map((f) => (
          <div key={f.path}>
            <span>{f.path}</span>
            <span>{size(f.size)}</span>
          </div>
        ))}
      </details>
      {lecturer ? (
        <section className="submissions">
          <div className="section-label">
            <h3>Bài nộp</h3>
            <button
              disabled={busy || demo || !published}
              title={
                demo
                  ? "Thu file thật cần Electron và worker"
                  : undefined
              }
              onClick={() =>
                void run(async () => {
                  await unwrap(
                    api.invoke("submissions.collectNow", {
                      assignmentId: selected,
                    }),
                  );
                  setMessage(
                    "Đã yêu cầu thu bài. Theo dõi tiến trình để biết kết quả.",
                  );
                })
              }
            >
              Thu bài về máy ↓
            </button>
          </div>
          {demo && (
            <p className="hint">
              Bảng mẫu · thu file thật chưa khả dụng trong bản
              xem thử.
            </p>
          )}
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Sinh viên</th>
                  <th>Trạng thái</th>
                  <th>Lần nộp</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.student.id}>
                    <td>
                      <strong>{row.student.fullName}</strong>
                      <small>{row.student.mssv}</small>
                    </td>
                    <td>
                      <span
                        className={
                          row.state === "da_nop"
                            ? "status-good"
                            : ""
                        }
                      >
                        {row.state === "da_nop"
                          ? "Đã nộp"
                          : row.state === "nop_tre"
                            ? "Nộp trễ"
                            : "Chưa nộp"}
                      </span>
                    </td>
                    <td>{row.submitCount || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {rows.length === 0 && (
            <p className="hint">
              Chưa có sinh viên tham gia bài này.
            </p>
          )}
          <button
            className="text-button delete-action"
            onClick={() => setModal("delete")}
          >
            Xoá bài tập
          </button>
        </section>
      ) : (
        <section className="submit-section">
          <h3>Nộp bài làm</h3>
          <p>
            Chọn đúng thư mục bài làm. Bản mới chỉ thay bản cũ
            sau khi được xác minh.
          </p>
          <div className="actions">
            <button
              disabled={busy || transferring}
              onClick={() => void pick()}
            >
              {selection
                ? selection.label
                : "Chọn thư mục bài làm"}
            </button>
            <button
              className={currentStudent?.local.hasWorkCopy ? 'primary' : ''}
              disabled={!selection || busy || transferring}
              onClick={() =>
                void run(async () => {
                  if (selection) {
                    const result = await unwrap(
                      api.invoke("student.submit", {
                        assignmentId: selected,
                        selectionId: selection.selectionId,
                      }),
                    );
                    track(result.operationId, selected, 'submit', selection.totalSize);
                  }
                })
              }
            >
              Gửi bài nộp ↗
            </button>
          </div>
          {receipt && (
            <div className="receipt">
              <h3>
                {demo ? "Biên nhận mẫu" : "Đã nhận bài nộp"}
              </h3>
              <p>
                Phiên bản {receipt.version} ·{" "}
                {date(receipt.receivedAt)}
              </p>
              <p>
                {receipt.isLate ? "Nộp trễ hạn" : "Đúng hạn"} ·{" "}
                {receipt.fileCount} file
              </p>
              <small>Mã băm xác nhận</small>
              <code>{receipt.manifestHash}</code>
            </div>
          )}
        </section>
      )}
    </>
  );
}
