import { join, resolve } from 'node:path';
import { DEFAULT_LIMITS, type Limits } from '@croc-classroom/shared';
import { z } from 'zod';

export interface ServerConfig {
  host: string;
  port: number;
  logLevel: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'silent';
  /** Thư mục dữ liệu (/data trên VPS). */
  dataDir: string;
  /** File SQLite, mặc định `<dataDir>/db/croc-classroom.sqlite`. `:memory:` khi test. */
  dbPath: string;
  /** IP/CIDR của reverse proxy được tin (Caddy). false = không tin header X-Forwarded-*. */
  trustProxy: string[] | false;
  relay: { address: string; password: string };
  limits: Limits;
  /** Kiểm tra phản hồi theo schema hợp đồng trước khi gửi (bắt lỗi lệch hợp đồng sớm). */
  validateResponses: boolean;
  /** Giới hạn kích thước body JSON (byte). */
  bodyLimitBytes: number;
  /**
   * CHỈ ĐỂ PHÁT TRIỂN: dùng dịch vụ vé giả, bài tự phát hành sau khi tạo mà không truyền file.
   * Mặc định tắt. Không bật trên VPS thật.
   */
  devFakeTransfers: boolean;
}

export class ConfigError extends Error {
  constructor(readonly problems: string[]) {
    super(`Cấu hình không hợp lệ:\n- ${problems.join('\n- ')}`);
    this.name = 'ConfigError';
  }
}

const boolFromEnv = z
  .enum(['true', 'false', '1', '0'])
  .transform((v) => v === 'true' || v === '1');

const EnvSchema = z.object({
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  DATA_DIR: z.string().min(1).default('./data'),
  DB_PATH: z.string().min(1).optional(),
  TRUST_PROXY: z.string().default(''),
  RELAY_ADDRESS: z.string().regex(/^[^\s:]+:\d{1,5}$/, 'RELAY_ADDRESS phải có dạng host:port'),
  RELAY_PASS: z.string().min(8, 'RELAY_PASS tối thiểu 8 ký tự'),
  VALIDATE_RESPONSES: boolFromEnv.default(true),
  BODY_LIMIT_BYTES: z.coerce.number().int().positive().default(8 * 1024 * 1024),
  DEV_FAKE_TRANSFERS: boolFromEnv.default(false),
});

/**
 * Chỉ lấy đường dẫn CSDL (cho lệnh CLI, không cần cấu hình relay).
 * Cùng quy tắc với loadConfig: DB_PATH, nếu không có thì `<DATA_DIR>/db/croc-classroom.sqlite`.
 */
export function loadDbPath(env: Record<string, string | undefined> = process.env): string {
  if (env.DB_PATH === ':memory:') return ':memory:';
  const dataDir = resolve(env.DATA_DIR || './data');
  return resolve(env.DB_PATH || join(dataDir, 'db', 'croc-classroom.sqlite'));
}

/** maxAssignmentBytes → LIMIT_MAX_ASSIGNMENT_BYTES */
export function limitEnvName(key: keyof Limits): string {
  return `LIMIT_${key.replace(/[A-Z]/g, (c) => `_${c}`).toUpperCase()}`;
}

export function loadConfig(env: Record<string, string | undefined> = process.env): ServerConfig {
  const problems: string[] = [];
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) problems.push(`${issue.path.join('.')}: ${issue.message}`);
  }

  const limits: Limits = { ...DEFAULT_LIMITS };
  for (const key of Object.keys(DEFAULT_LIMITS) as (keyof Limits)[]) {
    const name = limitEnvName(key);
    const raw = env[name];
    if (raw === undefined || raw === '') continue;
    const value = Number(raw);
    if (!Number.isSafeInteger(value) || value <= 0) problems.push(`${name}: phải là số nguyên dương`);
    else limits[key] = value;
  }

  if (problems.length > 0 || !parsed.success) throw new ConfigError(problems);
  const e = parsed.data;
  const dataDir = resolve(e.DATA_DIR);
  const proxies = e.TRUST_PROXY.split(',').map((s) => s.trim()).filter(Boolean);
  return {
    host: e.HOST,
    port: e.PORT,
    logLevel: e.LOG_LEVEL,
    dataDir,
    dbPath: e.DB_PATH === ':memory:' ? ':memory:' : resolve(e.DB_PATH ?? join(dataDir, 'db', 'croc-classroom.sqlite')),
    trustProxy: proxies.length > 0 ? proxies : false,
    relay: { address: e.RELAY_ADDRESS, password: e.RELAY_PASS },
    limits,
    validateResponses: e.VALIDATE_RESPONSES,
    bodyLimitBytes: e.BODY_LIMIT_BYTES,
    devFakeTransfers: e.DEV_FAKE_TRANSFERS,
  };
}
