import type { AppSettings } from "@croc-classroom/shared";
import { unwrap, type Ctx } from "./common.js";

/** Màn "Cài đặt": thư mục làm bài / thu bài, chia sẻ lại đề, xoá cache. */
export function SettingsPage({
  ctx: { api, demo, busy, run, setModal },
  settings,
  setSettings,
}: {
  ctx: Ctx;
  settings: AppSettings;
  setSettings: (settings: AppSettings) => void;
}) {
  return (
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
  );
}
