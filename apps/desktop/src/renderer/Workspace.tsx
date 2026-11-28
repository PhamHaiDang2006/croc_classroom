import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import type {
  AppSettings,
  CrocApi,
  LecturerAssignment,
  LecturerAssignmentDetail,
  PayloadSelection,
  Receipt,
  SessionState,
  Student,
  StudentAssignmentDetail,
  StudentAssignmentView,
  SubmissionRowView,
  TransferEvent,
} from "@croc-classroom/shared";
import { terminal, unwrap, type Ctx, type ModalKind, type Page } from "./common.js";
import { Mark } from "./ui.js";
import { AssignmentsPage } from "./AssignmentsPage.js";
import { StudentsPage } from "./StudentsPage.js";
import { SettingsPage } from "./SettingsPage.js";
import { WorkspaceModal } from "./WorkspaceModal.js";

/** Khung sau khi đăng nhập: thanh bên, tiêu đề, thông báo và các màn hình. Giữ trạng thái dùng chung. */
export function Workspace({
  api,
  session,
  demo,
}: {
  api: CrocApi;
  session: SessionState;
  demo: boolean;
}) {
  const lecturer = session.user!.role === "lecturer";
  const [page, setPage] = useState<Page>("assignments");
  const [assignments, setAssignments] = useState<LecturerAssignment[]>([]);
  const [studentAssignments, setStudentAssignments] = useState<
    StudentAssignmentView[]
  >([]);
  const [selected, setSelected] = useState("");
  const [detail, setDetail] = useState<
    LecturerAssignmentDetail | StudentAssignmentDetail | null
  >(null);
  const [rows, setRows] = useState<SubmissionRowView[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [transfers, setTransfers] = useState<Record<string, TransferEvent>>({});
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [connection, setConnection] = useState("connecting");
  const [modal, setModal] = useState<ModalKind | null>(null);
  const [selection, setSelection] = useState<PayloadSelection | null>(null);
  const [search, setSearch] = useState("");
  const generation = useRef(0);

  const refresh = useCallback(async () => {
    if (lecturer) setAssignments(await unwrap(api.invoke("assignments.list")));
    else
      setStudentAssignments(
        await unwrap(api.invoke("student.listAssignments")),
      );
  }, [api, lecturer]);
  useEffect(() => {
    refresh()
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
    const stops = [
      api.on("transfer", (event) => {
        setTransfers((old) => ({ ...old, [event.operationId]: event }));
        if (terminal(event))
          void refresh().catch((e: Error) => setError(e.message));
      }),
      api.on("assignment", () => {
        void refresh().catch((e: Error) => setError(e.message));
      }),
      api.on("connection", (event) => setConnection(event.server)),
    ];
    return () => stops.forEach((stop) => stop());
  }, [api, refresh]);
  useEffect(() => {
    const list = lecturer ? assignments : studentAssignments;
    if (!list.some((a) => a.id === selected)) setSelected(list[0]?.id ?? "");
  }, [assignments, studentAssignments, lecturer, selected]);
  useEffect(() => {
    const current = ++generation.current;
    setDetail(null);
    setReceipt(null);
    setRows([]);
    if (!selected) return;
    const load = async () => {
      const value = lecturer
        ? await unwrap(
            api.invoke("assignments.get", { assignmentId: selected }),
          )
        : await unwrap(
            api.invoke("student.getAssignment", { assignmentId: selected }),
          );
      if (generation.current !== current) return;
      setDetail(value);
      if (lecturer) {
        const submissions = await unwrap(
          api.invoke("submissions.list", { assignmentId: selected }),
        );
        if (generation.current === current) setRows(submissions);
      } else {
        const latest = await unwrap(
          api.invoke("student.getReceipt", { assignmentId: selected }),
        );
        if (generation.current === current) setReceipt(latest);
      }
    };
    void load().catch((e: Error) => {
      if (generation.current === current) setError(e.message);
    });
    return () => {
      generation.current++;
    };
  }, [api, selected, lecturer, assignments, studentAssignments]);
  useEffect(() => { setSelection(null); }, [selected]);
  async function run(work: () => Promise<void>) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await work();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const ctx: Ctx = { api, demo, lecturer, busy, run, setMessage, setModal, refresh };
  async function navigate(next: typeof page) {
    setPage(next);
    setSearch("");
    await run(async () => {
      if (next === "students")
        setStudents(await unwrap(api.invoke("students.list")));
      if (next === "settings")
        setSettings(await unwrap(api.invoke("settings.get")));
    });
  }
  // Lượt chia sẻ lại đề cho bạn (seed) chạy nền: không phải thao tác của người dùng, không được khoá
  // nút nhận đề / nộp bài hay hiện như tiến trình của chính họ.
  const latestTransfer = Object.values(transfers)
    .filter((event) => event.assignmentId === selected && event.kind !== "seed")
    .at(-1);
  const transferring = !!latestTransfer && !terminal(latestTransfer);
  const list = lecturer ? assignments : studentAssignments;
  const filtered = list.filter((a) =>
    a.title.toLocaleLowerCase("vi").includes(search.toLocaleLowerCase("vi")),
  );
  const currentStudent = studentAssignments.find((a) => a.id === selected);
  const pick = () =>
    run(async () =>
      setSelection(
        await unwrap(api.invoke("dialog.pickPayload", { mode: "directory" })),
      ),
    );
  function track(operationId: string, assignmentId: string, kind: TransferEvent['kind'], bytesTotal: number) {
    setTransfers((old) => old[operationId] ? old : { ...old, [operationId]: {
      operationId, assignmentId, kind, bytesTotal, bytesDone: 0, phase: 'preparing', at: new Date().toISOString(),
    } });
  }
  async function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    await run(async () => {
      if (!selection) throw new Error("Hãy chọn bộ file đề bài trước.");
      const deadline = String(data.get("deadline") ?? "");
      const result = await unwrap(
        api.invoke("assignments.create", {
          title: String(data.get("title")),
          description: String(data.get("description")),
          deadlineAt: deadline ? new Date(deadline).toISOString() : null,
          selectionId: selection.selectionId,
        }),
      );
      track(result.operationId, result.assignment.id, 'upload', result.assignment.totalSize);
      await refresh();
      setSelected(result.assignment.id);
      setModal(null);
    });
  }
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="./">
          <Mark />
          croc<span>classroom</span>
        </a>
        <p className="workspace-label">
          Không gian {lecturer ? "giảng viên" : "sinh viên"}
        </p>
        <nav className="side-nav" aria-label="Điều hướng chính">
          <button
            aria-current={page === "assignments" ? "page" : undefined}
            onClick={() => void navigate("assignments")}
          >
            <span aria-hidden="true">▤</span>Bài tập
            <span className="nav-count">{list.length}</span>
          </button>
          {lecturer && (
            <button
              aria-current={page === "students" ? "page" : undefined}
              onClick={() => void navigate("students")}
            >
              <span aria-hidden="true">≡</span>Sinh viên
            </button>
          )}
          <button
            aria-current={page === "settings" ? "page" : undefined}
            onClick={() => void navigate("settings")}
          >
            <span aria-hidden="true">⊙</span>Cài đặt
          </button>
        </nav>
        <div className="sidebar-bottom">
          <div className="connection">
            <span className="connection-dot" />
            {demo
              ? "Không gian xem thử"
              : connection === "online"
                ? "Đã kết nối máy chủ"
                : connection === "offline"
                  ? "Mất kết nối máy chủ"
                  : "Đang kết nối máy chủ"}
          </div>
          <div className="profile">
            <span className="avatar">
              {session.user!.fullName.split(" ").at(-1)?.slice(0, 1)}
            </span>
            <div>
              <strong>{session.user!.fullName}</strong>
              <small>{lecturer ? "Giảng viên" : "Sinh viên"}</small>
            </div>
          </div>
          <button
            className="text-button"
            onClick={() =>
              void run(async () => {
                await unwrap(api.invoke("session.logout"));
              })
            }
          >
            Đăng xuất
          </button>
        </div>
      </aside>
      <main className="main">
        <header className="topbar">
          <span>
            Lớp học /{" "}
            {page === "assignments"
              ? "Bài tập"
              : page === "students"
                ? "Sinh viên"
                : "Cài đặt"}
          </span>
          <span>
            {new Intl.DateTimeFormat("vi-VN", { dateStyle: "long" }).format(
              new Date(),
            )}
          </span>
          <button className="mobile-logout text-button" onClick={() => void run(async () => { await unwrap(api.invoke('session.logout')); })}>Đăng xuất</button>
        </header>
        <div className="page-body">
          <header className="page-heading">
            <div>
              <h1>
                {page === "assignments"
                  ? lecturer
                    ? "Giao bài. Giữ nhịp lớp học."
                    : "Bài tập, từng bước một."
                  : page === "students"
                    ? "Sinh viên trong lớp"
                    : "Theo cách bạn làm việc"}
              </h1>
              <p>
                {page === "assignments"
                  ? lecturer
                    ? "Đề bài, mã chia sẻ và bài nộp — trong cùng một không gian."
                    : "Nhập mã từ giảng viên, nhận đề và nộp bài tại đây."
                  : page === "students"
                    ? "Quản lý tài khoản và mã kích hoạt sinh viên."
                    : "Thư mục lưu bài và cách bạn chia sẻ lại đề."}
              </p>
            </div>
            {page === "assignments" && lecturer && (
              <button
                className="primary"
                onClick={() => {
                  setSelection(null);
                  setModal("create");
                }}
              >
                + Tạo bài tập
              </button>
            )}
            {page === "students" && (
              <button className="primary" onClick={() => setModal("import")}>
                Nhập danh sách CSV
              </button>
            )}
          </header>
          {error && (
            <div className="notice error" role="alert">
              {error}
              <button
                onClick={() => setError("")}
                aria-label="Đóng thông báo lỗi"
              >
                Đóng
              </button>
            </div>
          )}
          {message && (
            <div className="notice" role="status">
              {message}
            </div>
          )}
          {page === "assignments" && (
            <AssignmentsPage
              ctx={ctx}
              list={list}
              filtered={filtered}
              search={search}
              setSearch={setSearch}
              loading={loading}
              selected={selected}
              setSelected={setSelected}
              detail={detail}
              currentStudent={currentStudent}
              rows={rows}
              receipt={receipt}
              latestTransfer={latestTransfer}
              transferring={transferring}
              selection={selection}
              pick={pick}
              track={track}
            />
          )}
          {page === "students" && (
            <StudentsPage ctx={ctx} students={students} setStudents={setStudents} />
          )}
          {page === "settings" && settings && (
            <SettingsPage ctx={ctx} settings={settings} setSettings={setSettings} />
          )}
          <footer className="page-footer">
            <span>Croc Classroom</span>
            <span>
              {demo
                ? "Dữ liệu mẫu chỉ dùng để kiểm tra giao diện."
                : "Giao đề và nhận bài qua croc."}
            </span>
          </footer>
        </div>
      </main>
      {modal && (
        <WorkspaceModal
          ctx={ctx}
          modal={modal}
          error={error}
          selected={selected}
          detail={detail}
          selection={selection}
          pick={pick}
          create={create}
          setStudents={setStudents}
        />
      )}
    </div>
  );
}
