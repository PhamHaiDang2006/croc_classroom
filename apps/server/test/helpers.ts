import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { createAccounts, type Accounts } from '../src/accounts/index.js';
import type { Argon2Params } from '../src/accounts/password.js';
import { buildApp, type AppDeps } from '../src/app.js';
import { loadConfig, type ServerConfig } from '../src/config.js';
import { migrate, openDatabase, type Db } from '../src/db/index.js';
import type { Clock } from '../src/ports/clock.js';

export const TEST_ENV = {
  RELAY_ADDRESS: 'relay.test:9009',
  RELAY_PASS: 'mat-khau-relay-test',
  DB_PATH: ':memory:',
  LOG_LEVEL: 'silent',
} as const;

/** Tham số Argon2 rất nhẹ để test chạy nhanh. Không dùng ngoài test. */
export const FAST_ARGON2: Argon2Params = { memory: 64, passes: 2, parallelism: 1 };

export function testConfig(overrides: Record<string, string> = {}): ServerConfig {
  return loadConfig({ ...TEST_ENV, ...overrides });
}

export function testDb(): Db {
  const db = openDatabase(':memory:');
  migrate(db);
  return db;
}

export async function testApp(deps: Partial<AppDeps> = {}): Promise<{ app: FastifyInstance; db: Db }> {
  const db = deps.db ?? testDb();
  const app = await buildApp({ config: testConfig(), db, ...deps });
  return { app, db };
}

/** Đồng hồ điều khiển được để thử hạn mã, hạn phiên, cửa sổ giới hạn tần suất. */
export class FakeClock implements Clock {
  private current: number;
  constructor(start = '2026-11-17T08:00:00.000Z') {
    this.current = Date.parse(start);
  }
  now(): Date {
    return new Date(this.current);
  }
  advance(ms: number): void {
    this.current += ms;
  }
}

export const MINUTE = 60_000;
export const DAY = 24 * 60 * MINUTE;

export interface AccountsHarness {
  app: FastifyInstance;
  db: Db;
  clock: FakeClock;
  accounts: Accounts;
  /** Gọi API như client thật (JSON, header Bearer). */
  call(method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, options?: { token?: string; body?: unknown }): Promise<LightMyRequestResponse>;
  loginLecturer(): Promise<string>;
}

export const LECTURER = { username: 'giangvien', fullName: 'Nguyễn Văn Giảng', password: 'mat-khau-gv-1' };

/** Server có module tài khoản, CSDL trong bộ nhớ, đồng hồ giả và sẵn một tài khoản GV. */
export async function accountsHarness(options: { logStream?: NodeJS.WritableStream; logLevel?: string } = {}): Promise<AccountsHarness> {
  const db = testDb();
  const clock = new FakeClock();
  const accounts = createAccounts({ db, clock, passwordParams: FAST_ARGON2 });
  await accounts.service.createLecturer(LECTURER);
  const app = await buildApp({
    config: testConfig(options.logLevel ? { LOG_LEVEL: options.logLevel } : {}),
    db,
    clock,
    sessions: accounts.sessions,
    modules: [accounts.routes],
    ...(options.logStream ? { logStream: options.logStream } : {}),
  });
  const call: AccountsHarness['call'] = (method, url, { token, body } = {}) =>
    app.inject({
      method,
      url,
      headers: token ? { authorization: `Bearer ${token}` } : {},
      ...(body === undefined ? {} : { payload: body as object }),
    });
  const loginLecturer = async () => {
    const res = await call('POST', '/auth/login', {
      body: { role: 'lecturer', username: LECTURER.username, password: LECTURER.password },
    });
    if (res.statusCode !== 200) throw new Error(`Đăng nhập GV lỗi: ${res.body}`);
    return res.json().token as string;
  };
  return { app, db, clock, accounts, call, loginLecturer };
}
