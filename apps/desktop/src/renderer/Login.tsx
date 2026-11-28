import { useState } from "react";
import type { FormEvent } from "react";
import type { CrocApi, SessionState } from "@croc-classroom/shared";
import { unwrap } from "./common.js";
import { Mark } from "./ui.js";

export function Login({
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
