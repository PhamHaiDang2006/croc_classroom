import { describe, expect, it } from 'vitest';
import type { TransferEvent } from '@croc-classroom/shared';
import { fixtureCredentials, fixtureIds } from '@croc-classroom/shared/fixtures';
import { createMockCrocApi } from '@croc-classroom/shared/mocks';

const fast = { latencyMs: 0, transferStepMs: 1 } as const;

function waitForPhase(api: ReturnType<typeof createMockCrocApi>, operationId: string, phases: string[]): Promise<TransferEvent[]> {
  const seen: TransferEvent[] = [];
  return new Promise((resolve) => {
    const off = api.on('transfer', (event) => {
      if (event.operationId !== operationId) return;
      seen.push(event);
      if (phases.includes(event.phase)) {
        off();
        resolve(seen);
      }
    });
  });
}

describe('mock IPC (MOCK — không chứng minh luồng thật)', () => {
  it('đăng nhập SV bằng thông tin fixture, sai mật khẩu thì báo lỗi', async () => {
    const api = createMockCrocApi(fast);
    const bad = await api.invoke('session.login', {
      serverUrl: 'https://x.test',
      credentials: { role: 'student', mssv: fixtureCredentials.student.mssv, password: 'sai-mat-khau' },
    });
    expect(bad).toEqual({ ok: false, error: { code: 'INVALID_CREDENTIALS', message: expect.any(String) } });

    const good = await api.invoke('session.login', {
      serverUrl: 'https://x.test',
      credentials: { role: 'student', ...fixtureCredentials.student },
    });
    expect(good.ok && good.data.user?.role).toBe('student');
  });

  it('kiểm tra đầu vào như main process', async () => {
    const api = createMockCrocApi({ ...fast, loggedInAs: 'student' });
    const result = await api.invoke('student.join', { codePhrase: 'khong hop le' });
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.code).toBe('INVALID_INPUT');
  });

  it('SV vào bài, nhận đề, nộp bài và có biên nhận', async () => {
    const api = createMockCrocApi({ ...fast, loggedInAs: 'student' });
    const joined = await api.invoke('student.join', { codePhrase: fixtureCredentials.codePhrase.toUpperCase() });
    expect(joined.ok).toBe(true);

    const fetch = await api.invoke('student.fetch', { assignmentId: fixtureIds.assignmentPublished });
    if (!fetch.ok) throw new Error('fetch lỗi');
    const fetchEvents = await waitForPhase(api, fetch.data.operationId, ['succeeded', 'failed']);
    expect(fetchEvents.map((e) => e.phase)).toEqual(['preparing', 'transferring', 'transferring', 'verifying', 'succeeded']);

    const pick = await api.invoke('dialog.pickPayload', { mode: 'directory' });
    if (!pick.ok || !pick.data) throw new Error('pick lỗi');
    const submit = await api.invoke('student.submit', { assignmentId: fixtureIds.assignmentPublished, selectionId: pick.data.selectionId });
    if (!submit.ok) throw new Error('submit lỗi');
    const submitEvents = await waitForPhase(api, submit.data.operationId, ['succeeded']);
    expect(submitEvents.at(-1)?.receipt?.version).toBe(1);

    const receipt = await api.invoke('student.getReceipt', { assignmentId: fixtureIds.assignmentPublished });
    expect(receipt.ok && receipt.data?.version).toBe(1);
  });

  it('SV không gọi được chức năng GV', async () => {
    const api = createMockCrocApi({ ...fast, loggedInAs: 'student' });
    const result = await api.invoke('students.list');
    expect(!result.ok && result.error.code).toBe('FORBIDDEN');
  });

  it('ép lỗi theo kênh để thử giao diện', async () => {
    const api = createMockCrocApi({ ...fast, loggedInAs: 'lecturer', failures: { 'assignments.list': 'OFFLINE' } });
    const result = await api.invoke('assignments.list');
    expect(!result.ok && result.error.code).toBe('OFFLINE');
  });

  it('huỷ đăng ký listener', () => {
    const api = createMockCrocApi(fast);
    const off = api.on('connection', () => {});
    expect(api.listenerCount('connection')).toBe(1);
    off();
    expect(api.listenerCount()).toBe(0);
  });
});
