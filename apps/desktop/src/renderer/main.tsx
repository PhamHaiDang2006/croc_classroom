import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";
import { loadApi } from "./api.js";
import "@fontsource/be-vietnam-pro/400.css";
import "@fontsource/be-vietnam-pro/500.css";
import "./styles.css";

const root = createRoot(document.getElementById("root")!);
loadApi()
  .then(({ api, demo }) => {
    root.render(
      <StrictMode>
        {api ? (
          <App api={api} demo={demo} />
        ) : (
          <main className="unavailable">
            <h1>Mở Croc Classroom trong ứng dụng desktop</h1>
            <p>
              Bản này cần kết nối Electron để truy cập file và tài khoản. Bản
              xem thử chạy bằng lệnh dev, sử dụng dữ liệu mẫu.
            </p>
          </main>
        )}
      </StrictMode>,
    );
  })
  .catch(() =>
    root.render(
      <main className="unavailable">
        <h1>Không thể khởi động giao diện</h1>
        <p>Vui lòng tải lại ứng dụng.</p>
      </main>,
    ),
  );
