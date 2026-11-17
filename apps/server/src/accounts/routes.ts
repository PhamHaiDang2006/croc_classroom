import { endpoints } from '@croc-classroom/shared';
import type { RouteModule } from '../app.js';
import { bearerToken, registerEndpoint } from '../http/route.js';
import type { AccountsService } from './service.js';

/** Route REST của module tài khoản (contracts: REST — nhóm tài khoản). */
export function accountRoutes(service: AccountsService): RouteModule {
  return (app, deps) => {
    registerEndpoint(app, endpoints.login, ({ body, request }) => service.login(body, request.ip), deps);
    registerEndpoint(app, endpoints.activate, ({ body, request }) => service.activate(body, request.ip), deps);
    registerEndpoint(app, endpoints.logout, async ({ request }) => service.logoutToken(bearerToken(request)), deps);
    registerEndpoint(app, endpoints.me, async ({ auth }) => service.me(auth), deps);

    registerEndpoint(app, endpoints.importStudents, async ({ body }) => service.importStudents(body.csv), deps);
    registerEndpoint(app, endpoints.listStudents, async () => ({ students: service.listStudents() }), deps);
    registerEndpoint(app, endpoints.updateStudent, async ({ params, body }) => service.setDisabled(params.id, body.disabled), deps);
    registerEndpoint(app, endpoints.reissueActivationCode, async ({ params }) => service.reissueActivationCode(params.id), deps);
  };
}
