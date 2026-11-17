import { CONTRACT_VERSION, endpoints, ERROR_HTTP_STATUS } from '@croc-classroom/shared';
import Fastify, { type FastifyInstance } from 'fastify';
import type { ServerConfig } from './config.js';
import type { Db } from './db/index.js';
import { AppError, appError } from './http/errors.js';
import { registerEndpoint, type RouteDeps } from './http/route.js';
import { systemClock, nowIso, type Clock } from './ports/clock.js';
import { rejectAllSessions, type SessionResolver } from './ports/sessions.js';

/** Một module nghiệp vụ đăng ký route của mình (qua registerEndpoint) trước khi server sẵn sàng. */
export type RouteModule = (app: FastifyInstance, deps: RouteDeps) => void;

export interface AppDeps {
  config: ServerConfig;
  db: Db;
  clock?: Clock;
  sessions?: SessionResolver;
  /** accounts, assignments, submissions (C), distribution (D)… thêm dần theo mốc. */
  modules?: RouteModule[];
}

interface FastifyLikeError {
  statusCode?: number;
  code?: string;
  message?: string;
}

/** Tạo server Fastify với xử lý lỗi theo hợp đồng và các route đã có. Không gọi listen(). */
export async function buildApp(deps: AppDeps): Promise<FastifyInstance> {
  const { config, db } = deps;
  const clock = deps.clock ?? systemClock;
  const routeDeps: RouteDeps = {
    sessions: deps.sessions ?? rejectAllSessions,
    validateResponses: config.validateResponses,
  };

  const app = Fastify({
    trustProxy: config.trustProxy,
    bodyLimit: config.bodyLimitBytes,
    logger: {
      level: config.logLevel,
      // Không ghi token, mật khẩu, code croc (AGENTS.md, system-design mục 8).
      redact: {
        paths: ['req.headers.authorization', 'req.headers.cookie', '*.password', '*.crocCode', '*.token'],
        censor: '[an]',
      },
    },
  });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof AppError) {
      return reply.code(error.httpStatus).send(error.toBody());
    }
    const e = error as FastifyLikeError;
    if (e.code === 'FST_ERR_CTP_BODY_TOO_LARGE' || e.statusCode === 413) {
      const err = appError('PAYLOAD_TOO_LARGE');
      return reply.code(err.httpStatus).send(err.toBody());
    }
    if (e.statusCode !== undefined && e.statusCode >= 400 && e.statusCode < 500) {
      // JSON hỏng, Content-Type sai… do Fastify phát hiện trước khi tới route.
      const err = appError('VALIDATION_FAILED', e.message);
      return reply.code(err.httpStatus).send(err.toBody());
    }
    request.log.error({ err: error }, 'Lỗi không xử lý');
    const err = appError('INTERNAL');
    return reply.code(ERROR_HTTP_STATUS.INTERNAL).send(err.toBody());
  });

  app.setNotFoundHandler((_request, reply) => {
    const err = appError('NOT_FOUND');
    return reply.code(err.httpStatus).send(err.toBody());
  });

  registerEndpoint(
    app,
    endpoints.health,
    async () => {
      db.prepare('SELECT 1').get();
      return { status: 'ok' as const, contractVersion: CONTRACT_VERSION, serverTime: nowIso(clock) };
    },
    routeDeps,
  );

  for (const register of deps.modules ?? []) register(app, routeDeps);

  await app.ready();
  return app;
}
