import type { RouteModule } from '../app.js';
import type { Db } from '../db/index.js';
import { ACCOUNT_FAILURE_RULE, FailureLimiter, IP_FAILURE_RULE, type RateLimitRule } from '../http/rate-limit.js';
import type { Clock } from '../ports/clock.js';
import type { Argon2Params } from './password.js';
import { accountRoutes } from './routes.js';
import { AccountsService } from './service.js';
import { SessionService } from './sessions.js';

export { AccountsService } from './service.js';
export { SessionService } from './sessions.js';

export interface Accounts {
  service: AccountsService;
  /** SessionResolver cho buildApp và WebSocket (D). */
  sessions: SessionService;
  routes: RouteModule;
}

/** Dựng module tài khoản: phiên, giới hạn tần suất, dịch vụ và route. */
export function createAccounts(deps: {
  db: Db;
  clock: Clock;
  passwordParams?: Argon2Params;
  /** Chỉ test mới hạ trần theo IP. */
  ipFailureRule?: RateLimitRule;
}): Accounts {
  const sessions = new SessionService(deps.db, deps.clock);
  const limiter = new FailureLimiter(ACCOUNT_FAILURE_RULE, deps.clock);
  const ipLimiter = new FailureLimiter(deps.ipFailureRule ?? IP_FAILURE_RULE, deps.clock);
  const service = new AccountsService({ db: deps.db, clock: deps.clock, sessions, limiter, ipLimiter, ...(deps.passwordParams ? { passwordParams: deps.passwordParams } : {}) });
  return { service, sessions, routes: accountRoutes(service) };
}
