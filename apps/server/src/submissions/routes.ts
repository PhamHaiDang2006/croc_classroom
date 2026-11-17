import { endpoints } from '@croc-classroom/shared';
import type { RouteModule } from '../app.js';
import { registerEndpoint } from '../http/route.js';
import type { SubmissionsService } from './service.js';

/** Route REST của module bài nộp (contracts: REST — nhóm nộp bài). */
export function submissionRoutes(service: SubmissionsService): RouteModule {
  return (app, deps) => {
    // Sinh viên
    registerEndpoint(app, endpoints.submit, ({ auth, params, body }) => service.submit(auth.userId, params.id, body.manifest), deps);
    registerEndpoint(app, endpoints.myReceipt, async ({ auth, params }) => service.myReceipt(auth.userId, params.id), deps);

    // Giảng viên
    registerEndpoint(app, endpoints.listSubmissions, async ({ params }) => ({ rows: service.list(params.id) }), deps);
    registerEndpoint(app, endpoints.collect, ({ auth, params }) => service.collect(auth.userId, params.id), deps);
  };
}
