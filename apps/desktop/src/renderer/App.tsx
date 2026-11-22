import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import type {
  AppSettings,
  CrocApi,
  IpcResult,
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

const date = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat("vi-VN", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(value))
    : "Không có hạn nộp";
const size = (bytes: number) =>
  bytes < 1024
    ? `${bytes} B`
    : bytes < 1048576
      ? `${(bytes / 1024).toFixed(1)} KB`
      : `${(bytes / 1048576).toFixed(1)} MB`;
const phases: Record<TransferEvent["phase"], string> = {
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
const terminal = (event: TransferEvent) =>
  ["succeeded", "failed", "cancelled", "timeout"].includes(event.phase);
async function unwrap<T>(promise: Promise<IpcResult<T>>): Promise<T> {
  const result = await promise;
  if (!result.ok) throw new Error(result.error.message);
  return result.data;
}

function Mark() {
  return (
    <svg
      width="32"
      height="32"
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M6 10h15l5 5-5 5H9l-3 4V10Z"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path d="M10 14h9m-9 4h5" stroke="currentColor" strokeWidth="2" />
      <circle cx="22" cy="11" r="2" fill="currentColor" />
    </svg>
  );
}
function Modal({
  title,
  close,
  children,
}: {
  title: string;
  close: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  return (
    <dialog ref={ref} onCancel={(event) => { event.preventDefault(); close(); }} aria-label={title}>
      <div className="dialog-heading">
        <h2>{title}</h2>
        <button onClick={close} aria-label="Đóng hộp thoại">
          Đóng
        </button>
      </div>
      {children}
    </dialog>
  );
}

export function App({ api, demo }: { api: CrocApi; demo: boolean }) {
  const [session, setSession] = useState<SessionState | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    unwrap(api.invoke("session.get"))
      .then((value) => {
        if (active) setSession(value);
      })
      .catch((e: Error) => {
        if (active) setError(e.message);
      });
    const stop = api.on("session", () =>
      setSession({ user: null, serverUrl: session?.serverUrl ?? "" }),
    );
    return () => {
      active = false;
      stop();
    };
  }, [api]);
  return (
    <>
      {demo && (
        <aside className="demo-bar">
          <span>Bản xem thử · dữ liệu mẫu, không truyền file thật</span>
          <nav aria-label="Vai trò xem thử">
            <a href="?role=lecturer">Giảng viên</a>
            <a href="?role=student">Sinh viên</a>
            <a href="?role=login">Đăng nhập</a>
          </nav>
        </aside>
      )}
      {error ? (
        <main className="unavailable" role="alert">
          {error}
          <button onClick={() => window.location.reload()}>Thử lại</button>
        </main>
      ) : !session ? (
        <main className="unavailable" role="status">
          Đang mở lớp học…
        </main>
      ) : session.user ? (
        <Workspace
          key={session.user.id}
          api={api}
          session={session}
          demo={demo}
        />
      ) : (
        <Login api={api} demo={demo} onLogin={setSession} />
      )}
    </>
  );
}

function Login({
  api,
  demo,
  onLogin,
}: {
  api: CrocApi;
  demo: boolean;
  onLogin: (value: SessionState) => void;
}) {
  const [role, setRole] = useState<"lecturer" | "student">("lecturer");
  const [activate, setActivate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const data = new FormData(e.currentTarget);
    const value = (key: string) => String(data.get(key) ?? "");
    try {
      onLogin(
        await unwrap(
          activate
            ? api.invoke("session.activate", {
                serverUrl: value("server"),
                request: {
                  mssv: value("account"),
                  activationCode: value("code"),
                  newPassword: value("password"),
                },
              })
            : api.invoke("session.login", {
                serverUrl: value("server"),
                credentials:
                  role === "lecturer"
                    ? {
                        role,
                        username: value("account"),
                        password: value("password"),
                      }
                    : {
                        role,
                        mssv: value("account"),
                        password: value("password"),
                      },
              }),
        ),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="login-layout">
      <section>
        <a className="brand" href="./">
          <Mark />
          croc<span>classroom</span>
        </a>
        <h1>
          Bài tập đến lớp.
          <br />
          Bài làm về đúng chỗ.
        </h1>
        <p>Một mã giao bài cho cả lớp. Một nơi để theo dõi từng bài nộp.</p>
        <div className="login-note">
          <span>01 / Giao bài</span>
          <span>02 / Nhận đề</span>
          <span>03 / Nộp & thu bài</span>
        </div>
      </section>
      <section className="login-card">
        <h2>{activate ? "Kích hoạt tài khoản" : "Vào lớp học của bạn"}</h2>
        <div className="tabs">
          <button
            aria-pressed={role === "lecturer"}
            onClick={() => {
              setRole("lecturer");
              setActivate(false);
            }}
          >
            Giảng viên
          </button>
          <button
            aria-pressed={role === "student"}
            onClick={() => setRole("student")}
          >
            Sinh viên
          </button>
        </div>
        <form onSubmit={submit}>
          <label>
            Địa chỉ máy chủ
            <input
              name="server"
              type="url"
              required
              defaultValue={demo ? "https://croc-classroom.example.test" : ""}
              placeholder="https://lop-hoc.example.com"
            />
          </label>
          <label>
            {role === "lecturer" ? "Tên đăng nhập" : "Mã số sinh viên"}
            <input name="account" autoComplete="username" required />
          </label>
          {activate && (
            <label>
              Mã kích hoạt
              <input name="code" required />
            </label>
          )}
          <label>
            Mật khẩu
            <input
              name="password"
              type="password"
              minLength={8}
              autoComplete={activate ? "new-password" : "current-password"}
              required
            />
          </label>
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          <button className="primary" disabled={busy}>
            {busy ? "Đang kết nối…" : activate ? "Kích hoạt" : "Đăng nhập"}
          </button>
        </form>
        {role === "student" && (
          <button
            className="text-button"
            onClick={() => setActivate(!activate)}
          >
            {activate
              ? "Đã có tài khoản? Đăng nhập"
              : "Lần đầu sử dụng? Kích hoạt tài khoản"}
          </button>
        )}
        {demo && (
          <p className="hint">
            Tài khoản mẫu:{" "}
            {role === "lecturer"
              ? "giangvien / matkhau-gv-123"
              : "20210001 / matkhau-sv-123"}
            .
          </p>
        )}
      </section>
    </main>
  );
}

function Workspace({
  api,
  session,
  demo,
}: {
  api: CrocApi;
  session: SessionState;
  demo: boolean;
}) {
  const lecturer = session.user!.role === "lecturer";
  const [page, setPage] = useState<"assignments" | "students" | "settings">(
    "assignments",
  );
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
  const [modal, setModal] = useState<
    "create" | "delete" | "import" | "deadline" | "cache" | null
  >(null);
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
  const latestTransfer = Object.values(transfers)
    .filter((event) => event.assignmentId === selected)
    .at(-1);
  const transferring = !!latestTransfer && !terminal(latestTransfer);
  const list = lecturer ? assignments : studentAssignments;
  const filtered = list.filter((a) =>
    a.title.toLocaleLowerCase("vi").includes(search.toLocaleLowerCase("vi")),
  );
  const currentStudent = studentAssignments.find((a) => a.id === selected);
  const published =
    detail && "status" in detail && detail.status === "da_phat_hanh";
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
                  {!detail ? (
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
                  ) : (
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
                  )}
                </section>
              </div>
            </>
          )}
          {page === "students" && (
            <section className="surface">
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Sinh viên</th>
                      <th>Lớp</th>
                      <th>Tài khoản</th>
                      <th>Thao tác</th>
                    </tr>
                  </thead>
                  <tbody>
                    {students.map((student) => (
                      <tr key={student.id}>
                        <td>
                          <strong>{student.fullName}</strong>
                          <small>{student.mssv}</small>
                        </td>
                        <td>{student.classLabel ?? "—"}</td>
                        <td>
                          {student.disabled
                            ? "Đã vô hiệu hoá"
                            : student.activated
                              ? "Đã kích hoạt"
                              : "Chờ kích hoạt"}
                        </td>
                        <td>
                          <button
                            disabled={busy}
                            onClick={() =>
                              void run(async () => {
                                await unwrap(
                                  api.invoke("students.setDisabled", {
                                    studentId: student.id,
                                    disabled: !student.disabled,
                                  }),
                                );
                                setStudents(
                                  await unwrap(api.invoke("students.list")),
                                );
                              })
                            }
                          >
                            {student.disabled ? "Mở lại" : "Vô hiệu hoá"}
                          </button>
                          <button
                            disabled={busy}
                            onClick={() =>
                              void run(async () => {
                                const code = await unwrap(
                                  api.invoke("students.reissueActivation", {
                                    studentId: student.id,
                                  }),
                                );
                                setMessage(
                                  `Mã kích hoạt của ${code.mssv}: ${code.activationCode}. Hạn: ${date(code.activationExpiresAt)}`,
                                );
                              })
                            }
                          >
                            Cấp lại mã
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
          {page === "settings" && settings && (
            <section className="surface settings">
              <h2>Lưu bài ở đâu?</h2>
              {(["workDir", "collectDir"] as const).map((field) => (
                <div className="setting-row" key={field}>
                  <div>
                    <h3>
                      {field === "workDir"
                        ? "Thư mục làm bài"
                        : "Thư mục thu bài"}
                    </h3>
                    <p>{settings[field]}</p>
                  </div>
                  <button
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        const value = await unwrap(
                          api.invoke("settings.chooseDirectory", { field }),
                        );
                        if (value) setSettings(value);
                      })
                    }
                  >
                    Thay đổi
                  </button>
                </div>
              ))}
              <div className="setting-row">
                <div>
                  <h3>Chia sẻ lại đề bài</h3>
                  <p>Khi ứng dụng đang mở, giúp bạn cùng mạng nhận đề.</p>
                </div>
                <label className="checkbox">
                  <input
                    type="checkbox"
                    checked={settings.seedingEnabled}
                    disabled={busy}
                    onChange={(e) => {
                      const seedingEnabled = e.target.checked;
                    const previous = settings;
                    setSettings({ ...settings, seedingEnabled });
                    void run(async () => {
                      try {
                        setSettings(await unwrap(api.invoke("settings.update", { seedingEnabled })));
                      } catch (error) {
                        setSettings(previous);
                        throw error;
                      }
                    });
                    }}
                  />
                  Bật chia sẻ
                </label>
              </div>
              <label>
                Số lượt chia sẻ đồng thời
                <select
                  value={settings.seedingConcurrency}
                  disabled={busy}
                  onChange={(e) => {
                    const seedingConcurrency = Number(e.target.value);
                    void run(async () =>
                      setSettings(
                        await unwrap(
                          api.invoke("settings.update", { seedingConcurrency }),
                        ),
                      ),
                    );
                  }}
                >
                  {[1, 2, 3, 4].map((n) => (
                    <option key={n}>{n}</option>
                  ))}
                </select>
              </label>
              <div className="setting-row"><div><h3>Cache chia sẻ</h3><p>Xoá bản đề dùng để chia sẻ lại. Bản làm bài của bạn được giữ nguyên.</p></div><button disabled={busy || demo} title={demo ? 'Mock chưa mô phỏng xoá cache' : undefined} onClick={() => setModal('cache')}>Xoá cache</button></div>
            </section>
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
      )}
    </div>
  );
}
