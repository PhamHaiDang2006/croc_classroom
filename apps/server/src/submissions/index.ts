import type { Limits } from '@croc-classroom/shared';
import type { RouteModule } from '../app.js';
import type { Db } from '../db/index.js';
import type { Clock } from '../ports/clock.js';
import type { TicketIssuer } from '../ports/transfers.js';
import { submissionRoutes } from './routes.js';
import { SubmissionsService } from './service.js';

export { SubmissionsService, type SubmissionOutcomes } from './service.js';

export interface Submissions {
  service: SubmissionsService;
  routes: RouteModule;
}

/** Dựng module bài nộp. `tickets` là dịch vụ vé của D (hoặc bản giả khi test). */
export function createSubmissions(deps: { db: Db; clock: Clock; limits: Limits; tickets: TicketIssuer }): Submissions {
  const service = new SubmissionsService(deps);
  return { service, routes: submissionRoutes(service) };
}
