import { test, expect } from "@playwright/test";

test("lecturer sees a published code, searches assignments and creates a new assignment", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByText("sao-mai-xanh-042", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("textbox", { name: "Tìm bài tập" })
    .fill("không tồn tại");
  await expect(
    page.getByRole("heading", { name: "Không tìm thấy bài" }),
  ).toBeVisible();
  await page.getByRole("textbox", { name: "Tìm bài tập" }).fill("");
  await page.getByRole("button", { name: "+ Tạo bài tập" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Tên bài tập").fill("Bài kiểm tra giao diện");
  await expect(
    dialog.getByRole("button", { name: "Tạo và tải đề lên" }),
  ).toBeDisabled();
  await dialog.getByRole("button", { name: "Chọn thư mục đề" }).click();
  await dialog.getByRole("button", { name: "Tạo và tải đề lên" }).click();
  await expect(dialog).not.toBeVisible();
  await expect(
    page
      .getByRole("heading", { name: "Bài kiểm tra giao diện", exact: true })
      .last(),
  ).toBeVisible();
  await expect(page.getByText("Mã giao bài cho cả lớp")).toBeVisible();
});

test("student joins, receives files and sees a receipt only after submission completes", async ({
  page,
}) => {
  await page.goto("/?role=student");
  await page.getByLabel("Mã bài từ giảng viên").fill("sai-ma-bai-123");
  await page.getByRole("button", { name: "Tham gia bài" }).click();
  await expect(page.getByRole("alert")).toContainText("Code không đúng");
  await page.getByLabel("Mã bài từ giảng viên").fill("sao-mai-xanh-042");
  await page.getByRole("button", { name: "Tham gia bài" }).click();
  await page.getByRole("button", { name: /Nhận đề bài/ }).click();
  await expect(
    page.getByRole("button", { name: /Mở thư mục bài/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Chọn thư mục bài làm" }).click();
  await page.getByRole("button", { name: /Gửi bài nộp/ }).click();
  await expect(
    page.getByRole("heading", { name: "Biên nhận mẫu" }),
  ).not.toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Biên nhận mẫu" }),
  ).toBeVisible();
  await page.screenshot({ path: '../../docs/screenshots/frontend-student.png', fullPage: true });
});

test("login rejects bad credentials and accepts the documented demo account", async ({
  page,
}) => {
  await page.goto("/?role=login");
  await page.getByLabel("Tên đăng nhập").fill("sai");
  await page.getByLabel("Mật khẩu", { exact: true }).fill("matkhau-sai");
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Sai tài khoản");
  await page.getByLabel("Tên đăng nhập").fill("giangvien");
  await page.getByLabel("Mật khẩu", { exact: true }).fill("matkhau-gv-123");
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Giao bài. Giữ nhịp lớp học." }),
  ).toBeVisible();
});

test("student accounts, settings and deletion confirmation work", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Sinh viên", exact: true }).click();
  const row = page.getByRole("row").filter({ hasText: "Trần Thị An" });
  await row.getByRole("button", { name: "Vô hiệu hoá" }).click();
  await expect(row).toContainText("Đã vô hiệu hoá");
  await page.getByRole("button", { name: "Cài đặt", exact: true }).click();
  await page.getByLabel("Bật chia sẻ").uncheck();
  await expect(page.getByLabel("Bật chia sẻ")).not.toBeChecked();
  await page
    .getByRole("button", { name: /Bài tập/ })
    .first()
    .click();
  await page.getByRole("button", { name: "Xoá bài tập", exact: true }).click();
  await page.getByRole("button", { name: "Giữ bài tập" }).click();
  await expect(
    page.getByText("sao-mai-xanh-042", { exact: true }),
  ).toBeVisible();
});

test("desktop and mobile have no page overflow; capture the new frontend", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto("/");
  await expect(
    page.getByText("sao-mai-xanh-042", { exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "../../docs/screenshots/frontend-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "../../docs/screenshots/frontend-mobile.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
  await page.getByRole('button', { name: 'Đăng xuất', exact: true }).filter({ visible: true }).click();
  await expect(page.getByRole('heading', { name: 'Vào lớp học của bạn' })).toBeVisible();
});

test('failed transfer never creates a success receipt', async ({ page }) => {
  await page.goto('/?role=student&outcome=failed');
  await page.getByLabel('Mã bài từ giảng viên').fill('sao-mai-xanh-042');
  await page.getByRole('button', { name: 'Tham gia bài' }).click();
  await page.getByRole('button', { name: 'Chọn thư mục bài làm' }).click();
  await page.getByRole('button', { name: /Gửi bài nộp/ }).click();
  await expect(page.getByText('Truyền file thất bại', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Biên nhận mẫu' })).not.toBeVisible();
  await expect(page.getByRole('button', { name: /Gửi bài nộp/ })).toBeEnabled();
});

test('native IPC errors are displayed without silently switching to mock data', async ({ page }) => {
  await page.addInitScript(() => {
    Object.assign(window, { croc: {
      invoke: async (channel: string) => channel === 'session.get'
        ? { ok: true, data: { serverUrl: 'https://example.test', user: { id: 'test-lecturer', role: 'lecturer', fullName: 'Giảng viên kiểm thử', username: 'test' } } }
        : { ok: false, error: { code: 'INTERNAL', message: 'Không kết nối được máy chủ' } },
      on: () => () => {},
    } });
  });
  await page.goto('/');
  await expect(page.getByRole('alert')).toContainText('Không kết nối được máy chủ');
  await expect(page.getByText('Bản xem thử · dữ liệu mẫu, không truyền file thật')).not.toBeVisible();
});

test('background seeding to classmates does not block the student own submit', async ({ page }) => {
  const assignmentId = '0b6f3c5e-6d0f-4c69-9a0b-7d2f8e1c4a21';
  const detail = {
    id: assignmentId, title: 'Bài chia sẻ', description: '', deadlineAt: null, totalSize: 6, fileCount: 1,
    joinedAt: '2026-11-17T08:00:00.000Z', receivedAt: '2026-11-17T08:01:00.000Z', latestReceipt: null,
    manifest: { version: 1, files: [{ path: 'de.txt', size: 6, sha256: 'a'.repeat(64) }] },
  };
  await page.addInitScript(({ detail }) => {
    const listeners: Record<string, ((value: unknown) => void)[]> = {};
    const { manifest: _manifest, ...summary } = detail;
    const data: Record<string, unknown> = {
      'session.get': { serverUrl: 'https://example.test', user: { id: 'test-student', role: 'student', fullName: 'Sinh viên kiểm thử', mssv: '20210001' } },
      'student.listAssignments': [{ ...summary, local: { hasWorkCopy: true, seeding: true } }],
      'student.getAssignment': detail,
      'student.getReceipt': null,
      'dialog.pickPayload': { selectionId: '7a1c5f0e-0d7b-4b55-9f0a-2c4b9d6c1e11', label: 'bai-lam', fileCount: 1, totalSize: 6 },
    };
    Object.assign(window, {
      emitTransfer: (value: unknown) => (listeners.transfer ?? []).forEach((listener) => listener(value)),
      croc: {
        invoke: async (channel: string) => ({ ok: true, data: data[channel] ?? null }),
        on: (event: string, listener: (value: unknown) => void) => {
          (listeners[event] ??= []).push(listener);
          return () => {};
        },
      },
    });
  }, { detail });
  await page.goto('/');
  await page.getByRole('button', { name: 'Chọn thư mục bài làm' }).click();
  const submit = page.getByRole('button', { name: /Gửi bài nộp/ });
  await expect(submit).toBeEnabled();
  await page.evaluate((id) => (window as unknown as { emitTransfer: (v: unknown) => void }).emitTransfer({
    operationId: 'seed-1', assignmentId: id, kind: 'seed', phase: 'transferring', bytesDone: 3, bytesTotal: 6, at: new Date().toISOString(),
  }), assignmentId);
  await expect(page.getByRole('button', { name: 'Huỷ truyền' })).not.toBeVisible();
  await expect(submit).toBeEnabled();
});
