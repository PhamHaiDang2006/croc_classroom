/* global window */
// Build the workspace before running. Uses isolated Electron and SQLite profiles.
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { createServer } from 'node:net';
import { _electron } from 'playwright';

const temp = await mkdtemp(join(tmpdir(), 'classroom-smoke-'));
const probe = createServer();
await new Promise((resolve) => probe.listen(0, '127.0.0.1', resolve));
const port = probe.address().port;
await new Promise((resolve) => probe.close(resolve));
const url = 'http://127.0.0.1:' + port;
const env = {
  ...process.env,
  DB_PATH: join(temp, 'smoke.sqlite'),
  DATA_DIR: temp,
  HOST: '127.0.0.1',
  PORT: String(port),
  RELAY_ADDRESS: '127.0.0.1:9009',
  RELAY_PASS: randomBytes(16).toString('hex'),
  LOG_LEVEL: 'silent',
};
const password = randomBytes(16).toString('hex');
let runtime, server, closed;
try {
  execFileSync(
    process.execPath,
    ['../server/dist/cli.js', 'create-lecturer', '--username', 'smoke', '--full-name', 'Smoke Test'],
    { env, input: password + '\n', stdio: ['pipe', 'ignore', 'pipe'] },
  );
  server = spawn(process.execPath, ['../server/dist/index.js'], { env, stdio: 'ignore', windowsHide: true });
  closed = new Promise((resolve) => server.once('close', resolve));
  for (let i = 0; i < 50; i++) {
    if (
      await fetch(url + '/health')
        .then((r) => r.ok)
        .catch(() => false)
    )
      break;
    await delay(100);
  }
  runtime = await _electron.launch({
    executablePath: process.env.CLASSROOM_SMOKE_EXECUTABLE,
    args: [
      '--user-data-dir=' + join(temp, 'electron'),
      ...(process.env.CLASSROOM_SMOKE_EXECUTABLE ? [] : [resolve('.')]),
    ],
    timeout: 20000,
  });
  const page = await runtime.firstWindow();
  await page.waitForFunction(() => typeof window.croc?.invoke === 'function');
  const result = await page.evaluate(
    async ({ url, password }) => {
      const api = window.croc;
      const invalid = await api.invoke('student.fetch', { assignmentId: 'invalid' });
      const login = await api.invoke('session.login', {
        serverUrl: url,
        credentials: { role: 'lecturer', username: 'smoke', password },
      });
      const listed = await api.invoke('students.list');
      const logout = await api.invoke('session.logout');
      return {
        invalid: invalid.error?.code,
        role: login.data?.user?.role,
        loginError: login.error,
        token: login.data?.token,
        listed,
        loggedOut: logout.data?.user === null,
        access: typeof window.require,
        keys: Object.keys(api).sort(),
      };
    },
    { url, password },
  );
  assert.deepEqual(result, {
    invalid: 'INVALID_INPUT',
    role: 'lecturer',
    loginError: undefined,
    token: undefined,
    listed: { ok: true, data: [] },
    loggedOut: true,
    access: 'undefined',
    keys: ['invoke', 'on'],
  });
  console.log('Electron preload, validation, server login, list and logout passed.');
} finally {
  await runtime?.close();
  server?.kill();
  await closed;
  await rm(temp, { recursive: true, force: true, maxRetries: 6, retryDelay: 150 });
}
