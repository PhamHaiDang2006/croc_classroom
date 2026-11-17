import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { createAccounts, type Accounts } from '../src/accounts/index.js';
import { createAssignments, type Assignments } from '../src/assignments/index.js';
import { createTransferOutcomeHandler } from '../src/outcomes.js';
import type { TransferOutcomeHandler } from '../src/ports/transfers.js';
import { createSubmissions, type Submissions } from '../src/submissions/index.js';
import { FakeTicketIssuer } from '../src/testing/fake-ticket-issuer.js';
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
  assignments: Assignments;
  /** Dịch vụ vé giả thay cho D. */
  issuer: FakeTicketIssuer;
  /** Số seeder online theo bài — thay cho thống kê của D. */
  seeding: Map<string, number>;
  submissions: Submissions;
  /** Handler đầy đủ (C) mà worker của D sẽ gọi. */
  outcomes: TransferOutcomeHandler;
  /** Gọi API như client thật (JSON, header Bearer). */
  call(method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, options?: { token?: string; body?: unknown }): Promise<LightMyRequestResponse>;
  loginLecturer(): Promise<string>;
}

export const LECTURER = { username: 'giangvien', fullName: 'Nguyễn Văn Giảng', password: 'mat-khau-gv-1' };

/**
 * Server có module tài khoản + bài tập, CSDL trong bộ nhớ, đồng hồ giả, dịch vụ vé giả và sẵn
 * một tài khoản GV. `env` ghi đè cấu hình (ví dụ LIMIT_*).
 */
export async function accountsHarness(
  options: { logStream?: NodeJS.WritableStream; logLevel?: string; env?: Record<string, string> } = {},
): Promise<AccountsHarness> {
  const db = testDb();
  const clock = new FakeClock();
  const config = testConfig({ ...(options.logLevel ? { LOG_LEVEL: options.logLevel } : {}), ...options.env });
  const accounts = createAccounts({ db, clock, passwordParams: FAST_ARGON2 });
  await accounts.service.createLecturer(LECTURER);
  const issuer = new FakeTicketIssuer(clock, db);
  const seeding = new Map<string, number>();
  const assignments = createAssignments({
    db,
    clock,
    limits: config.limits,
    tickets: issuer,
    seeding: { seedingCount: (id) => seeding.get(id) ?? 0 },
  });
  const submissions = createSubmissions({ db, clock, limits: config.limits, tickets: issuer });
  const outcomes = createTransferOutcomeHandler({ assignments: assignments.service, submissions: submissions.service });
  const app = await buildApp({
    config,
    db,
    clock,
    sessions: accounts.sessions,
    modules: [accounts.routes, assignments.routes, submissions.routes],
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
  return { app, db, clock, accounts, assignments, issuer, seeding, submissions, outcomes, call, loginLecturer };
}

/** Tên ngắn hơn cho test các mốc sau. */
export const serverHarness = accountsHarness;

/**
 * Tạo sẵn các SV đã kích hoạt qua API thật (nhập CSV → kích hoạt). Trả token và id theo MSSV.
 */
export async function activatedStudents(
  h: AccountsHarness,
  gvToken: string,
  mssvs: string[],
): Promise<Record<string, { id: string; token: string }>> {
  const csv = mssvs.map((m, i) => `${m},Sinh Viên ${i + 1}`).join('\n');
  const imported = await h.call('POST', '/students/import', { token: gvToken, body: { csv } });
  const result: Record<string, { id: string; token: string }> = {};
  for (const created of imported.json().created as { student: { id: string; mssv: string }; activation: { activationCode: string } }[]) {
    const res = await h.call('POST', '/auth/activate', {
      body: { mssv: created.student.mssv, activationCode: created.activation.activationCode, newPassword: 'mat-khau-sv-1' },
    });
    result[created.student.mssv] = { id: created.student.id, token: res.json().token };
  }
  return result;
}
