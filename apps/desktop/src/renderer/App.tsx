import { useEffect, useState } from "react";
import type { CrocApi, SessionState } from "@croc-classroom/shared";
import { unwrap } from "./common.js";
import { Login } from "./Login.js";
import { Workspace } from "./Workspace.js";

/**
 * Gốc giao diện: lấy phiên hiện tại rồi hiện màn đăng nhập hoặc Workspace.
 * Các màn hình nằm ở Login.tsx, Workspace.tsx (khung), AssignmentsPage/AssignmentDetail,
 * StudentsPage, SettingsPage và WorkspaceModal; hàm định dạng ở common.ts.
 */
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
