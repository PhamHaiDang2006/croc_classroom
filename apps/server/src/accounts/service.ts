import { randomUUID, timingSafeEqual } from 'node:crypto';
import {
  normalizeMssv,
  PasswordSchema,
  UsernameSchema,
  type ActivateRequestSchema,
  type ActivationCodeIssued,
  type LoginRequestSchema,
  type Session,
  type Student,
  type StudentImportResult,
  type User,
} from '@croc-classroom/shared';
import type { z } from 'zod';
import type { Db } from '../db/index.js';
import { appError } from '../http/errors.js';
import { ipBucket, type FailureLimiter } from '../http/rate-limit.js';
import type { Clock } from '../ports/clock.js';
import type { AuthContext } from '../ports/sessions.js';
import { parseStudentCsv } from './csv.js';
import { createDummyHash, DEFAULT_ARGON2_PARAMS, hashPassword, verifyPassword, type Argon2Params } from './password.js';
import type { SessionService } from './sessions.js';
import { generateActivationCode, hashActivationCode } from './tokens.js';

/** Hạn mã kích hoạt 14 ngày (system-design mục 7.2). */
export const ACTIVATION_TTL_MS = 14 * 24 * 60 * 60_000;

interface UserRow {
  id: string;
  role: 'lecturer' | 'student';
  username: string | null;
  mssv: string | null;
  full_name: string;
  class_label: string | null;
  password_hash: string | null;
  activation_code_hash: string | null;
  activation_expires_at: string | null;
  disabled: number;
  created_at: string;
}

export interface AccountsServiceDeps {
  db: Db;
  clock: Clock;
  sessions: SessionService;
  /** Đếm sai theo (tài khoản + nhóm IP). */
  limiter: FailureLimiter;
  /** Trần theo nhóm IP, cộng mọi tài khoản (đăng nhập + kích hoạt). */
  ipLimiter: FailureLimiter;
  /** Chỉ test mới hạ tham số để chạy nhanh. */
  passwordParams?: Argon2Params;
}

function sameHash(a: string, b: string): boolean {
  const left = Buffer.from(a, 'hex');
  const right = Buffer.from(b, 'hex');
  return left.length === right.length && timingSafeEqual(left, right);
}

export class AccountsService {
  private readonly db: Db;
  private readonly clock: Clock;
  private readonly sessions: SessionService;
  private readonly limiter: FailureLimiter;
  private readonly ipLimiter: FailureLimiter;
  private readonly passwordParams: Argon2Params;
  private readonly dummyHash: () => Promise<string>;

  constructor(deps: AccountsServiceDeps) {
    this.db = deps.db;
    this.clock = deps.clock;
    this.sessions = deps.sessions;
    this.limiter = deps.limiter;
    this.ipLimiter = deps.ipLimiter;
    this.passwordParams = deps.passwordParams ?? DEFAULT_ARGON2_PARAMS;
    this.dummyHash = createDummyHash(this.passwordParams);
  }

  // ------------------------------------------------------------ đăng nhập, phiên

  async login(request: z.output<typeof LoginRequestSchema>, ip: string): Promise<Session> {
    const identifier = request.role === 'student' ? normalizeMssv(request.mssv) : request.username;
    const bucket = ipBucket(ip);
    const key = `login:${request.role}:${identifier}|${bucket}`;
    const ipKey = `ip:${bucket}`;
    this.limiter.assertAllowed(key);
    this.ipLimiter.assertAllowed(ipKey);

    const row =
      request.role === 'student'
        ? this.findUser('mssv = ? AND role = ?', identifier, 'student')
        : this.findUser('username = ? AND role = ?', identifier, 'lecturer');

    if (!row) {
      await verifyPassword(await this.dummyHash(), request.password);
      this.recordFailure(key, ipKey);
      throw appError('INVALID_CREDENTIALS');
    }
    if (!row.password_hash) throw appError('ACCOUNT_NOT_ACTIVATED');
    if (!(await verifyPassword(row.password_hash, request.password))) {
      this.recordFailure(key, ipKey);
      throw appError('INVALID_CREDENTIALS');
    }
    // Chỉ báo bị vô hiệu hoá khi mật khẩu đúng, để không lộ trạng thái tài khoản cho người đoán mò.
    if (row.disabled) throw appError('ACCOUNT_DISABLED');

    this.limiter.reset(key);
    const created = this.sessions.create(row.id, request.deviceName);
    return { token: created.token, expiresAt: created.expiresAt, user: toUser(row) };
  }

  async activate(request: z.output<typeof ActivateRequestSchema>, ip: string): Promise<Session> {
    const mssv = normalizeMssv(request.mssv);
    const bucket = ipBucket(ip);
    const key = `activate:${mssv}|${bucket}`;
    const ipKey = `ip:${bucket}`;
    this.limiter.assertAllowed(key);
    this.ipLimiter.assertAllowed(ipKey);

    const row = this.findUser('mssv = ? AND role = ?', mssv, 'student');
    const codeHash = hashActivationCode(request.activationCode);
    const now = this.clock.now();
    const valid =
      row?.activation_code_hash != null &&
      row.activation_expires_at != null &&
      Date.parse(row.activation_expires_at) > now.getTime() &&
      sameHash(row.activation_code_hash, codeHash);
    if (!row || !valid) {
      this.recordFailure(key, ipKey);
      throw appError('ACTIVATION_INVALID');
    }
    if (row.disabled) throw appError('ACCOUNT_DISABLED');

    const passwordHash = await hashPassword(request.newPassword, this.passwordParams);
    const session = this.db.transaction(() => {
      // Chỉ thành công nếu mã vẫn là mã vừa kiểm tra (chặn hai lần kích hoạt đồng thời bằng cùng mã).
      const updated = this.db
        .prepare(
          `UPDATE users SET password_hash = ?, activation_code_hash = NULL, activation_expires_at = NULL
           WHERE id = ? AND activation_code_hash = ?`,
        )
        .run(passwordHash, row.id, row.activation_code_hash).changes;
      if (updated !== 1) throw appError('ACTIVATION_INVALID');
      this.sessions.revokeAllForUser(row.id);
      return this.sessions.create(row.id, request.deviceName);
    })();

    this.limiter.reset(key);
    return { token: session.token, expiresAt: session.expiresAt, user: toUser(row) };
  }

  logoutToken(token: string | null): void {
    if (token) this.sessions.revokeByToken(token);
  }

  me(auth: AuthContext): User {
    const row = this.findUser('id = ?', auth.userId);
    if (!row) throw appError('UNAUTHENTICATED');
    return toUser(row);
  }

  // ------------------------------------------------------------ quản lý sinh viên (GV)

  importStudents(csv: string): StudentImportResult {
    const { rows, errors } = parseStudentCsv(csv);
    const skipped: StudentImportResult['skipped'] = [];
    const seen = new Set<string>();
    const exists = this.db.prepare('SELECT 1 FROM users WHERE mssv = ?');
    const toCreate = rows.filter((row) => {
      if (seen.has(row.mssv)) {
        skipped.push({ line: row.line, mssv: row.mssv, reason: 'duplicate_in_file' });
        return false;
      }
      seen.add(row.mssv);
      if (exists.get(row.mssv)) {
        skipped.push({ line: row.line, mssv: row.mssv, reason: 'already_exists' });
        return false;
      }
      return true;
    });

    if (errors.length > 0) return { imported: false, created: [], skipped, errors };

    const now = this.clock.now();
    const createdAt = now.toISOString();
    const expiresAt = new Date(now.getTime() + ACTIVATION_TTL_MS).toISOString();
    const insert = this.db.prepare(
      `INSERT INTO users (id, role, mssv, full_name, class_label, activation_code_hash, activation_expires_at, created_at)
       VALUES (@id, 'student', @mssv, @full_name, @class_label, @activation_code_hash, @activation_expires_at, @created_at)`,
    );
    const created = this.db.transaction(() =>
      toCreate.map((row) => {
        const code = generateActivationCode();
        const id = randomUUID();
        insert.run({
          id,
          mssv: row.mssv,
          full_name: row.fullName,
          class_label: row.classLabel,
          activation_code_hash: hashActivationCode(code),
          activation_expires_at: expiresAt,
          created_at: createdAt,
        });
        return {
          student: this.toStudent(this.findUser('id = ?', id)!),
          activation: { studentId: id, mssv: row.mssv, activationCode: code, activationExpiresAt: expiresAt },
        };
      }),
    )();
    return { imported: true, created, skipped, errors: [] };
  }

  listStudents(): Student[] {
    const rows = this.db.prepare(`SELECT * FROM users WHERE role = 'student' ORDER BY mssv`).all() as UserRow[];
    return rows.map((row) => this.toStudent(row));
  }

  setDisabled(studentId: string, disabled: boolean): Student {
    const changes = this.db
      .prepare(`UPDATE users SET disabled = ? WHERE id = ? AND role = 'student'`)
      .run(disabled ? 1 : 0, studentId).changes;
    if (changes === 0) throw appError('NOT_FOUND', 'Không tìm thấy sinh viên');
    if (disabled) this.sessions.revokeAllForUser(studentId);
    return this.toStudent(this.findUser('id = ?', studentId)!);
  }

  reissueActivationCode(studentId: string): ActivationCodeIssued {
    const row = this.findUser(`id = ? AND role = 'student'`, studentId);
    if (!row) throw appError('NOT_FOUND', 'Không tìm thấy sinh viên');
    const code = generateActivationCode();
    const expiresAt = new Date(this.clock.now().getTime() + ACTIVATION_TTL_MS).toISOString();
    this.db
      .prepare('UPDATE users SET activation_code_hash = ?, activation_expires_at = ? WHERE id = ?')
      .run(hashActivationCode(code), expiresAt, studentId);
    return { studentId, mssv: row.mssv!, activationCode: code, activationExpiresAt: expiresAt };
  }

  // ------------------------------------------------------------ tài khoản GV (lệnh CLI)

  hasLecturer(): boolean {
    return this.findUser(`role = 'lecturer'`) !== undefined;
  }

  async createLecturer(input: { username: string; fullName: string; password: string }): Promise<User> {
    const username = UsernameSchema.parse(input.username);
    const fullName = input.fullName.trim().normalize('NFC');
    if (fullName === '') throw new Error('Họ tên không được trống');
    const password = PasswordSchema.parse(input.password);
    if (this.findUser(`role = 'lecturer'`)) throw new Error('Đã có tài khoản giảng viên (hệ thống chỉ có một)');
    const id = randomUUID();
    this.db
      .prepare(
        `INSERT INTO users (id, role, username, full_name, password_hash, created_at)
         VALUES (?, 'lecturer', ?, ?, ?, ?)`,
      )
      .run(id, username, fullName, await hashPassword(password, this.passwordParams), this.clock.now().toISOString());
    return toUser(this.findUser('id = ?', id)!);
  }

  async resetLecturerPassword(newPassword: string): Promise<User> {
    const password = PasswordSchema.parse(newPassword);
    const row = this.findUser(`role = 'lecturer'`);
    if (!row) throw new Error('Chưa có tài khoản giảng viên; dùng lệnh create-lecturer');
    this.db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(await hashPassword(password, this.passwordParams), row.id);
    this.sessions.revokeAllForUser(row.id);
    return toUser(row);
  }

  // ------------------------------------------------------------ tiện ích

  private recordFailure(accountKey: string, ipKey: string): void {
    this.limiter.recordFailure(accountKey);
    this.ipLimiter.recordFailure(ipKey);
  }

  private findUser(where: string, ...params: unknown[]): UserRow | undefined {
    return this.db.prepare(`SELECT * FROM users WHERE ${where}`).get(...params) as UserRow | undefined;
  }

  private toStudent(row: UserRow): Student {
    const pending =
      row.activation_code_hash != null &&
      row.activation_expires_at != null &&
      Date.parse(row.activation_expires_at) > this.clock.now().getTime();
    return {
      id: row.id,
      mssv: row.mssv!,
      fullName: row.full_name,
      classLabel: row.class_label,
      activated: row.password_hash != null,
      disabled: row.disabled === 1,
      activationExpiresAt: pending ? row.activation_expires_at : null,
      createdAt: row.created_at,
    };
  }
}

function toUser(row: UserRow): User {
  return row.role === 'lecturer'
    ? { id: row.id, role: 'lecturer', username: row.username!, fullName: row.full_name }
    : { id: row.id, role: 'student', mssv: row.mssv!, fullName: row.full_name, classLabel: row.class_label };
}
