import {
  toValidationIssues,
  type AnyEndpoint,
  type AuthRequirement,
  type EndpointBody,
  type EndpointParams,
  type EndpointQuery,
  type EndpointResponse,
  type ValidationIssue,
} from '@croc-classroom/shared';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { z } from 'zod';
import type { AuthContext, SessionResolver } from '../ports/sessions.js';
import { appError } from './errors.js';

export type AuthFor<A extends AuthRequirement> = A extends 'none'
  ? null
  : A extends 'lecturer'
    ? AuthContext & { role: 'lecturer' }
    : A extends 'student'
      ? AuthContext & { role: 'student' }
      : AuthContext;

export interface HandlerContext<E extends AnyEndpoint> {
  params: EndpointParams<E>;
  query: EndpointQuery<E>;
  body: EndpointBody<E>;
  auth: AuthFor<E['auth']>;
  request: FastifyRequest;
}

export type EndpointHandler<E extends AnyEndpoint> = (
  context: HandlerContext<E>,
) => Promise<E['response'] extends z.ZodType ? EndpointResponse<E> : void>;

export interface RouteDeps {
  sessions: SessionResolver;
  validateResponses: boolean;
}

/** Kiểm tra params, query, body; gom lỗi của cả ba phần để báo một lần. */
function parseRequest(endpoint: AnyEndpoint, request: FastifyRequest): { params: unknown; query: unknown; body: unknown } {
  const issues: ValidationIssue[] = [];
  const parsePart = (schema: z.ZodType | undefined, value: unknown, part: 'params' | 'query' | 'body'): unknown => {
    if (!schema) return undefined;
    const result = schema.safeParse(value ?? (part === 'body' ? {} : value));
    if (result.success) return result.data;
    for (const issue of toValidationIssues(result.error)) {
      issues.push({ ...issue, path: issue.path ? `${part}.${issue.path}` : part });
    }
    return undefined;
  };
  const parsed = {
    params: parsePart(endpoint.params, request.params, 'params'),
    query: parsePart(endpoint.query, request.query, 'query'),
    body: parsePart(endpoint.body, request.body, 'body'),
  };
  if (issues.length > 0) throw appError('VALIDATION_FAILED', undefined, issues);
  return parsed;
}

export function bearerToken(request: FastifyRequest): string | null {
  const header = request.headers.authorization;
  if (!header) return null;
  const match = /^Bearer\s+(\S+)$/i.exec(header);
  return match?.[1] ?? null;
}

async function authenticate(request: FastifyRequest, requirement: AuthRequirement, sessions: SessionResolver): Promise<AuthContext | null> {
  if (requirement === 'none') return null;
  const token = bearerToken(request);
  if (!token) throw appError('UNAUTHENTICATED');
  const resolution = await sessions.resolve(token);
  if (!resolution.ok) throw appError(resolution.code);
  if (requirement !== 'any' && resolution.auth.role !== requirement) throw appError('FORBIDDEN');
  return resolution.auth;
}

/**
 * Đăng ký một endpoint theo định nghĩa trong hợp đồng shared: xác thực, phân quyền theo vai trò,
 * kiểm tra params/query/body bằng schema, kiểm tra phản hồi (nếu bật), mã trạng thái thành công.
 * Mọi route nghiệp vụ phải đăng ký qua hàm này để không lệch hợp đồng.
 */
export function registerEndpoint<E extends AnyEndpoint>(app: FastifyInstance, endpoint: E, handler: EndpointHandler<E>, deps: RouteDeps): void {
  app.route({
    method: endpoint.method,
    url: endpoint.path,
    handler: async (request, reply) => {
      const auth = await authenticate(request, endpoint.auth, deps.sessions);
      const context = { ...parseRequest(endpoint, request), auth, request } as HandlerContext<E>;

      const result: unknown = await handler(context);

      if (!endpoint.response) {
        return reply.code(204).send();
      }
      let payload = result;
      if (deps.validateResponses) {
        const checked = endpoint.response.safeParse(result);
        if (!checked.success) {
          request.log.error({ issues: toValidationIssues(checked.error), route: endpoint.path }, 'Phản hồi lệch hợp đồng');
          throw appError('INTERNAL');
        }
        payload = checked.data;
      }
      return reply.code(endpoint.successStatus).send(payload);
    },
  });
}
