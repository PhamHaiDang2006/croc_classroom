import { describe, expect, it } from 'vitest';
import type { z } from 'zod';
import {
  API_ERROR_CODES,
  buildPath,
  ClientConfigSchema,
  ClientMessageSchema,
  DEFAULT_LIMITS,
  endpoints,
  ERROR_HTTP_STATUS,
  IPC_CHANNELS,
  ipcInputSchemas,
  IssuedTicketSchema,
  LecturerAssignmentDetailSchema,
  LecturerAssignmentSchema,
  normalizeActivationCode,
  ReceiptSchema,
  ServerMessageSchema,
  SessionSchema,
  StudentAssignmentDetailSchema,
  StudentImportResultSchema,
  StudentSchema,
  SubmissionRowSchema,
  ticketLifetimeMs,
  TicketInfoSchema,
  UserSchema,
} from '@croc-classroom/shared';
import * as f from '@croc-classroom/shared/fixtures';

describe('fixture đúng schema hợp đồng', () => {
  const cases: [string, z.ZodType, unknown][] = [
    ['lecturer user', UserSchema, f.fixtureLecturerUser],
    ['student user', UserSchema, f.fixtureStudentUser],
    ['session', SessionSchema, f.fixtureSession],
    ['client config', ClientConfigSchema, f.fixtureClientConfig],
    ['assignment', LecturerAssignmentSchema, f.fixtureLecturerAssignment],
    ['assignment uploading', LecturerAssignmentSchema, f.fixtureLecturerAssignmentUploading],
    ['assignment detail', LecturerAssignmentDetailSchema, f.fixtureLecturerAssignmentDetail],
    ['student assignment detail', StudentAssignmentDetailSchema, f.fixtureStudentAssignmentDetail],
    ['receipt', ReceiptSchema, f.fixtureReceipt],
    ['issued ticket', IssuedTicketSchema, f.fixtureIssuedTicket],
    ['ticket info', TicketInfoSchema, f.fixtureTicketInfo],
    ['import result', StudentImportResultSchema, f.fixtureImportResult],
    ...f.fixtureStudents.map((s): [string, z.ZodType, unknown] => [`student ${s.mssv}`, StudentSchema, s]),
    ...f.fixtureSubmissionRows.map((r): [string, z.ZodType, unknown] => [`row ${r.student.mssv}`, SubmissionRowSchema, r]),
    ...f.fixtureServerMessages.map((m): [string, z.ZodType, unknown] => [`ws ${m.type}`, ServerMessageSchema, m]),
  ];

  it.each(cases)('%s', (_name, schema, value) => {
    const result = schema.safeParse(value);
    expect(result.success, JSON.stringify(result.error?.issues)).toBe(true);
  });
});

describe('REST', () => {
  const all = Object.entries(endpoints);

  it('không có hai endpoint trùng method + path', () => {
    const keys = all.map(([, e]) => `${e.method} ${e.path}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it.each(all)('%s: tham số đường dẫn khớp schema params', (_name, endpoint) => {
    const inPath = [...endpoint.path.matchAll(/:([A-Za-z]+)/g)].map((m) => m[1]).sort();
    const schema = endpoint.params as z.ZodObject | undefined;
    const declared = schema ? Object.keys(schema.shape).sort() : [];
    expect(declared).toEqual(inPath);
  });

  it.each(all)('%s: GET/DELETE không có body; 204 khi không có response', (_name, endpoint) => {
    if (endpoint.method === 'GET' || endpoint.method === 'DELETE') expect(endpoint.body).toBeUndefined();
    if (!endpoint.response) expect(endpoint.successStatus).toBe(204);
  });

  it('buildPath mã hoá tham số và báo thiếu tham số', () => {
    expect(buildPath('/assignments/:id/fetch', { id: 'a/b' })).toBe('/assignments/a%2Fb/fetch');
    expect(() => buildPath('/tickets/:id')).toThrow(/id/);
  });

  it('mọi mã lỗi có HTTP status', () => {
    for (const code of API_ERROR_CODES) expect(ERROR_HTTP_STATUS[code]).toBeGreaterThanOrEqual(400);
  });

  it('login chấp nhận GV bằng username, SV bằng MSSV', () => {
    const body = endpoints.login.body;
    expect(body.safeParse({ role: 'lecturer', username: 'giangvien', password: '12345678' }).success).toBe(true);
    expect(body.safeParse({ role: 'student', mssv: '20210001', password: '12345678' }).success).toBe(true);
    expect(body.safeParse({ role: 'student', username: 'x', password: '12345678' }).success).toBe(false);
    expect(body.safeParse({ role: 'student', mssv: '20210001', password: 'ngan' }).success).toBe(false);
  });

  it('sửa bài cần ít nhất một trường', () => {
    expect(endpoints.updateAssignment.body.safeParse({}).success).toBe(false);
    expect(endpoints.updateAssignment.body.safeParse({ deadlineAt: null }).success).toBe(true);
  });

  it('fetch trả vé hoặc vị trí hàng đợi', () => {
    expect(endpoints.fetch.response.safeParse({ status: 'queued', position: 3 }).success).toBe(true);
    expect(endpoints.fetch.response.safeParse({ status: 'ticket', ticket: f.fixtureIssuedTicket }).success).toBe(true);
    expect(endpoints.fetch.body.safeParse({ localSubnets: ['192.168.1.0/24', 'fd00::/64'] }).success).toBe(true);
    expect(endpoints.fetch.body.safeParse({ localSubnets: ['192.168.1.1'] }).success).toBe(false);
  });
});

describe('WebSocket', () => {
  it('nhận thông điệp client hợp lệ và từ chối loại lạ', () => {
    expect(ClientMessageSchema.safeParse({ type: 'hello', protocol: 1, localSubnets: ['10.0.0.0/8'], appVersion: '0.1.0' }).success).toBe(true);
    expect(ClientMessageSchema.safeParse({ type: 'serve.reject', ticketId: f.fixtureIds.ticketFetch, reason: 'busy' }).success).toBe(true);
    expect(ClientMessageSchema.safeParse({ type: 'ticket.ready' }).success).toBe(false);
  });
});

describe('IPC', () => {
  it('mọi kênh có schema đầu vào', () => {
    expect(IPC_CHANNELS.length).toBeGreaterThan(0);
    for (const channel of IPC_CHANNELS) expect(ipcInputSchemas[channel]).toBeDefined();
  });

  it('kênh không có đầu vào chỉ nhận undefined', () => {
    expect(ipcInputSchemas['session.get'].safeParse(undefined).success).toBe(true);
    expect(ipcInputSchemas['session.get'].safeParse({ x: 1 }).success).toBe(false);
  });
});

describe('quy tắc dùng chung', () => {
  it('hạn vé = max(2 phút, dung lượng / 100 KB/s)', () => {
    expect(ticketLifetimeMs(0, DEFAULT_LIMITS)).toBe(120_000);
    expect(ticketLifetimeMs(100 * 1024 * 600, DEFAULT_LIMITS)).toBe(600_000);
  });

  it('chuẩn hoá mã kích hoạt', () => {
    expect(normalizeActivationCode(' abcd-efgh-jkmn ')).toBe('ABCDEFGHJKMN');
    expect(normalizeActivationCode('O0IL')).toBe('0011');
  });
});
