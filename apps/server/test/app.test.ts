import { afterEach, describe, expect, it } from 'vitest';
import { ApiErrorBodySchema, defineEndpoint, HealthSchema, IdSchema } from '@croc-classroom/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { registerEndpoint } from '../src/http/route.js';
import type { SessionResolver } from '../src/ports/sessions.js';
import { testApp } from './helpers.js';

const STUDENT = { userId: '00000000-0000-4000-8000-000000000101', role: 'student' as const, sessionId: 's1' };
const LECTURER = { userId: '00000000-0000-4000-8000-000000000001', role: 'lecturer' as const, sessionId: 's2' };

/** Phiên giả: token "sv" → SV, "gv" → GV, "khoa" → tài khoản bị vô hiệu hoá. */
const fakeSessions: SessionResolver = {
  resolve: async (token) =>
    token === 'sv'
      ? { ok: true, auth: STUDENT }
      : token === 'gv'
        ? { ok: true, auth: LECTURER }
        : token === 'khoa'
          ? { ok: false, code: 'ACCOUNT_DISABLED' }
          : { ok: false, code: 'UNAUTHENTICATED' },
};

const echo = defineEndpoint({
  method: 'POST',
  path: '/test/echo/:id',
  auth: 'lecturer',
  summary: 'test',
  params: z.object({ id: IdSchema }),
  body: z.object({ title: z.string().trim().min(1) }),
  response: z.object({ id: IdSchema, title: z.string(), by: z.string() }),
  successStatus: 201,
});
const drift = defineEndpoint({ method: 'GET', path: '/test/drift', auth: 'any', summary: 'test', response: z.object({ n: z.int() }) });
const noContent = defineEndpoint({ method: 'DELETE', path: '/test/thing', auth: 'student', summary: 'test' });

let app: FastifyInstance;
afterEach(async () => {
  await app?.close();
});

async function appWithTestRoutes() {
  ({ app } = await testApp({
    sessions: fakeSessions,
    modules: [
      (instance, deps) => {
        registerEndpoint(instance, echo, async ({ params, body, auth }) => ({ id: params.id, title: body.title, by: auth.role }), deps);
        registerEndpoint(instance, drift, async () => ({ n: 'khong-phai-so' }) as unknown as { n: number }, deps);
        registerEndpoint(instance, noContent, async () => undefined, deps);
      },
    ],
  }));
  return app;
}

const ID = '00000000-0000-4000-8000-000000000201';

describe('GET /health', () => {
  it('trả trạng thái đúng schema hợp đồng', async () => {
    ({ app } = await testApp());
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(HealthSchema.parse(res.json())).toMatchObject({ status: 'ok', contractVersion: 1 });
  });
});

describe('xử lý lỗi theo hợp đồng', () => {
  it('route không tồn tại → 404 NOT_FOUND', async () => {
    ({ app } = await testApp());
    const res = await app.inject({ method: 'GET', url: '/khong-co' });
    expect(res.statusCode).toBe(404);
    expect(ApiErrorBodySchema.parse(res.json()).error.code).toBe('NOT_FOUND');
  });

  it('M0 chưa có phiên: route cần đăng nhập trả 401', async () => {
    ({ app } = await testApp({
      modules: [(instance, deps) => registerEndpoint(instance, drift, async () => ({ n: 1 }), deps)],
    }));
    const res = await app.inject({ method: 'GET', url: '/test/drift', headers: { authorization: 'Bearer bat-ky' } });
    expect(res.statusCode).toBe(401);
  });
});

describe('registerEndpoint', () => {
  it('xác thực, kiểm tra đầu vào, trả mã thành công của hợp đồng', async () => {
    await appWithTestRoutes();
    const res = await app.inject({ method: 'POST', url: `/test/echo/${ID}`, headers: { authorization: 'Bearer gv' }, payload: { title: '  Bài 1 ' } });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toEqual({ id: ID, title: 'Bài 1', by: 'lecturer' });
  });

  it.each([
    [undefined, 401, 'UNAUTHENTICATED'],
    ['Bearer sai', 401, 'UNAUTHENTICATED'],
    ['Basic gv', 401, 'UNAUTHENTICATED'],
    ['Bearer khoa', 403, 'ACCOUNT_DISABLED'],
    ['Bearer sv', 403, 'FORBIDDEN'],
  ])('authorization=%j → %i %s', async (authorization, status, code) => {
    await appWithTestRoutes();
    const res = await app.inject({
      method: 'POST',
      url: `/test/echo/${ID}`,
      headers: authorization ? { authorization } : {},
      payload: { title: 'x' },
    });
    expect(res.statusCode).toBe(status);
    expect(res.json().error.code).toBe(code);
  });

  it('đầu vào sai → 400 VALIDATION_FAILED kèm vị trí lỗi', async () => {
    await appWithTestRoutes();
    const res = await app.inject({ method: 'POST', url: '/test/echo/khong-phai-uuid', headers: { authorization: 'Bearer gv' }, payload: { title: '' } });
    expect(res.statusCode).toBe(400);
    const body = ApiErrorBodySchema.parse(res.json());
    expect(body.error.code).toBe('VALIDATION_FAILED');
    expect((body.error.details as { path: string }[]).map((d) => d.path).sort()).toEqual(['body.title', 'params.id']);
  });

  it('JSON hỏng → 400 VALIDATION_FAILED', async () => {
    await appWithTestRoutes();
    const res = await app.inject({
      method: 'POST',
      url: `/test/echo/${ID}`,
      headers: { authorization: 'Bearer gv', 'content-type': 'application/json' },
      payload: '{hong',
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION_FAILED');
  });

  it('Content-Type json nhưng body rỗng: coi như không có body (review M0–M3)', async () => {
    await appWithTestRoutes();
    const json = { authorization: 'Bearer sv', 'content-type': 'application/json' };
    const noBody = await app.inject({ method: 'DELETE', url: '/test/thing', headers: json });
    expect(noBody.statusCode).toBe(204);
    const blank = await app.inject({ method: 'DELETE', url: '/test/thing', headers: json, payload: '  \n' });
    expect(blank.statusCode).toBe(204);
    // Endpoint cần body: báo thiếu trường cụ thể thay vì lỗi parser.
    const missing = await app.inject({ method: 'POST', url: `/test/echo/${ID}`, headers: { ...json, authorization: 'Bearer gv' } });
    expect(missing.statusCode).toBe(400);
    expect(missing.json().error.details).toEqual([{ path: 'body.title', message: expect.any(String) }]);
  });

  it('vẫn chặn JSON có __proto__ (parser mặc định của Fastify)', async () => {
    await appWithTestRoutes();
    const res = await app.inject({
      method: 'POST',
      url: `/test/echo/${ID}`,
      headers: { authorization: 'Bearer gv', 'content-type': 'application/json' },
      payload: '{"title":"x","__proto__":{"isAdmin":true}}',
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION_FAILED');
  });

  it('phản hồi lệch hợp đồng → 500 INTERNAL, không lộ dữ liệu sai', async () => {
    await appWithTestRoutes();
    const res = await app.inject({ method: 'GET', url: '/test/drift', headers: { authorization: 'Bearer sv' } });
    expect(res.statusCode).toBe(500);
    expect(res.json()).toEqual({ error: { code: 'INTERNAL', message: expect.any(String) } });
  });

  it('endpoint không có response → 204', async () => {
    await appWithTestRoutes();
    const res = await app.inject({ method: 'DELETE', url: '/test/thing', headers: { authorization: 'Bearer sv' } });
    expect(res.statusCode).toBe(204);
    expect(res.body).toBe('');
  });
});
