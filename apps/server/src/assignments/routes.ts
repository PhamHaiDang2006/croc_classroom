import { endpoints } from '@croc-classroom/shared';
import type { RouteModule } from '../app.js';
import { registerEndpoint } from '../http/route.js';
import type { AssignmentsService } from './service.js';

/** Route REST của module bài tập (contracts: REST — nhóm bài tập). */
export function assignmentRoutes(service: AssignmentsService): RouteModule {
  return (app, deps) => {
    // Giảng viên
    registerEndpoint(app, endpoints.createAssignment, ({ auth, body }) => service.create(auth.userId, body), deps);
    registerEndpoint(app, endpoints.renewUploadTicket, ({ auth, params }) => service.renewUploadTicket(auth.userId, params.id), deps);
    registerEndpoint(app, endpoints.listAssignments, async () => ({ assignments: service.list() }), deps);
    registerEndpoint(app, endpoints.getAssignment, async ({ params }) => service.get(params.id), deps);
    registerEndpoint(app, endpoints.updateAssignment, async ({ params, body }) => service.update(params.id, body), deps);
    registerEndpoint(app, endpoints.deleteAssignment, ({ params }) => service.delete(params.id), deps);

    // Sinh viên
    registerEndpoint(app, endpoints.join, async ({ auth, body, request }) => service.join(auth.userId, body.codePhrase, request.ip), deps);
    registerEndpoint(app, endpoints.myAssignments, async ({ auth }) => ({ assignments: service.myAssignments(auth.userId) }), deps);
    registerEndpoint(app, endpoints.myAssignment, async ({ auth, params }) => service.myAssignment(auth.userId, params.id), deps);
  };
}
