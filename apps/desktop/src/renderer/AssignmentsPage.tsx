import type { ComponentProps } from "react";
import type { LecturerAssignment, StudentAssignmentView } from "@croc-classroom/shared";
import { size, unwrap, type Ctx } from "./common.js";
import { AssignmentDetail } from "./AssignmentDetail.js";

type DetailProps = Omit<ComponentProps<typeof AssignmentDetail>, "ctx">;

/** Màn "Bài tập": ô nhập mã (SV), danh sách bài và chi tiết bài đang chọn. */
export function AssignmentsPage({
  ctx,
  list,
  filtered,
  search,
  setSearch,
  loading,
  setSelected,
  ...detailProps
}: DetailProps & {
  ctx: Ctx;
  list: (LecturerAssignment | StudentAssignmentView)[];
  filtered: (LecturerAssignment | StudentAssignmentView)[];
  search: string;
  setSearch: (search: string) => void;
  loading: boolean;
  setSelected: (id: string) => void;
}) {
  const { api, demo, lecturer, busy, run, refresh } = ctx;
  const { selected, detail } = detailProps;
  return (
    <>
      {!lecturer && (
        <form
          className="join-form"
          onSubmit={(e) => {
            e.preventDefault();
            const codePhrase = String(
              new FormData(e.currentTarget).get("code"),
            );
            void run(async () => {
              const joined = await unwrap(
                api.invoke("student.join", { codePhrase }),
              );
              await refresh();
              setSelected(joined.id);
            });
          }}
        >
          <label htmlFor="join-code">Mã bài từ giảng viên</label>
          <input
            id="join-code"
            name="code"
            placeholder="Ví dụ: sao-mai-xanh-042"
            required
          />
          <button disabled={busy} className={!detail ? "primary" : ""}>
            Tham gia bài
          </button>
          {demo && <small>Mã mẫu: sao-mai-xanh-042</small>}
        </form>
      )}
      <div className="work-grid">
        <section
          className="assignment-list"
          aria-label="Danh sách bài tập"
        >
          <div className="section-label">
            <h2>Bài tập của {lecturer ? "lớp" : "bạn"}</h2>
            <span>{list.length} bài</span>
          </div>
          <label className="search">
            <span className="sr-only">Tìm bài tập</span>
            <input
              placeholder="Tìm theo tên bài…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          {loading ? (
            <p role="status">Đang tải bài tập…</p>
          ) : filtered.length === 0 ? (
            <div className="empty">
              <h3>
                {list.length ? "Không tìm thấy bài" : "Chưa có bài tập"}
              </h3>
              <p>
                {list.length
                  ? "Thử một tên bài khác."
                  : lecturer
                    ? "Tạo bài đầu tiên để bắt đầu giao đề."
                    : "Nhập mã được giảng viên chia sẻ để bắt đầu."}
              </p>
            </div>
          ) : (
            filtered.map((a, i) => (
              <button
                className={`assignment-item ${a.id === selected ? "selected" : ""}`}
                key={a.id}
                onClick={() => setSelected(a.id)}
                aria-pressed={a.id === selected}
              >
                <div className="assignment-number">
                  {String(i + 1).padStart(2, "0")}
                  <span>
                    {"status" in a
                      ? a.status === "da_phat_hanh"
                        ? "Đã phát hành"
                        : "Chờ tải đề"
                      : a.latestReceipt
                        ? "Đã nộp bài"
                        : "Đang làm"}
                  </span>
                </div>
                <h3>{a.title}</h3>
                <p>
                  {a.fileCount} file · {size(a.totalSize)}
                </p>
                <div className="item-footer">
                  <span>
                    {a.deadlineAt
                      ? `Hạn ${new Date(a.deadlineAt).toLocaleDateString("vi-VN")}`
                      : "Chưa đặt hạn"}
                  </span>
                  <span aria-hidden="true">↗</span>
                </div>
              </button>
            ))
          )}
          <p className="list-note">
            {demo
              ? "Danh sách này sử dụng dữ liệu mẫu."
              : "Bài tập được đồng bộ từ máy chủ lớp học."}
          </p>
        </section>
        <section className="detail" aria-label="Chi tiết bài tập">
          <AssignmentDetail ctx={ctx} {...detailProps} />
        </section>
      </div>
    </>
  );
}
