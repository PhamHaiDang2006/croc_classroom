import type { Limits } from '@croc-classroom/shared';
import type { RouteModule } from '../app.js';
import type { Db } from '../db/index.js';
import { ACCOUNT_FAILURE_RULE, FailureLimiter } from '../http/rate-limit.js';
import type { Clock } from '../ports/clock.js';
import { noSeedingStats, type SeedingStats } from '../ports/seeding.js';
import type { TicketIssuer } from '../ports/transfers.js';
import { assignmentRoutes } from './routes.js';
import { AssignmentsService } from './service.js';

export { AssignmentsService, type AssignmentOutcomes } from './service.js';

export interface Assignments {
  service: AssignmentsService;
  routes: RouteModule;
}

/** Dựng module bài tập. `tickets` là dịch vụ vé của D (hoặc bản giả khi test). */
export function createAssignments(deps: {
  db: Db;
  clock: Clock;
  limits: Limits;
  tickets: TicketIssuer;
  seeding?: SeedingStats;
}): Assignments {
  const service = new AssignmentsService({
    ...deps,
    seeding: deps.seeding ?? noSeedingStats,
    // Nhập sai code phrase: cùng quy tắc 10 lần / 5 phút / (tài khoản + IP).
    joinLimiter: new FailureLimiter(ACCOUNT_FAILURE_RULE, deps.clock),
  });
  return { service, routes: assignmentRoutes(service) };
}
