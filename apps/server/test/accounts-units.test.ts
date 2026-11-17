import { argon2Sync } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { normalizeActivationCode } from '@croc-classroom/shared';
import { parseStudentCsv, MAX_IMPORT_ROWS } from '../src/accounts/csv.js';
import { DEFAULT_ARGON2_PARAMS, hashPassword, verifyPassword } from '../src/accounts/password.js';
import { generateActivationCode, generateSessionToken, hashActivationCode } from '../src/accounts/tokens.js';
import { FailureLimiter } from '../src/http/rate-limit.js';
import { FAST_ARGON2, FakeClock, MINUTE } from './helpers.js';

describe('Argon2id (crypto.argon2 của Node)', () => {
  it('khớp vector kiểm thử RFC 9106 mục 5.3', () => {
    const tag = argon2Sync('argon2id', {
      message: Buffer.alloc(32, 1),
      nonce: Buffer.alloc(16, 2),
      secret: Buffer.alloc(8, 3),
      associatedData: Buffer.alloc(12, 4),
      parallelism: 4,
      tagLength: 32,
      memory: 32,
      passes: 3,
    });
    expect(tag.toString('hex')).toBe('0d640df58d78766c08c037a34a8b53c9d01ef0452d75b65eb52520e96b01e659');
  });

  it('lưu dạng PHC với tham số mặc định OWASP và xác minh đúng/sai', async () => {
    const stored = await hashPassword('mật khẩu có dấu', DEFAULT_ARGON2_PARAMS);
    expect(stored).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$[A-Za-z0-9+/]{22}\$[A-Za-z0-9+/]{43}$/);
    await expect(verifyPassword(stored, 'mật khẩu có dấu')).resolves.toBe(true);
    await expect(verifyPassword(stored, 'mat khau co dau')).resolves.toBe(false);
  });

  it('cùng mật khẩu cho chuỗi băm khác nhau (salt ngẫu nhiên); chuỗi hỏng → false', async () => {
    const a = await hashPassword('12345678', FAST_ARGON2);
    const b = await hashPassword('12345678', FAST_ARGON2);
    expect(a).not.toBe(b);
    await expect(verifyPassword('khong-phai-phc', '12345678')).resolves.toBe(false);
    await expect(verifyPassword(a.replace('v=19', 'v=16'), '12345678')).resolves.toBe(false);
  });
});

describe('token và mã kích hoạt', () => {
  it('token phiên 256 bit, base64url', () => {
    const token = generateSessionToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(generateSessionToken()).not.toBe(token);
  });

  it('mã kích hoạt dạng XXXX-XXXX-XXXX Crockford, băm không phụ thuộc cách gõ', () => {
    const code = generateActivationCode();
    expect(code).toMatch(/^[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/);
    const typed = ` ${code.toLowerCase().replace(/-/g, ' ')} `;
    expect(hashActivationCode(typed)).toBe(hashActivationCode(code));
    expect(normalizeActivationCode('0O1IL')).toBe('00111');
  });
});

describe('đọc CSV sinh viên', () => {
  it('đọc có/không dòng tiêu đề, BOM, CRLF, ngoặc kép, dòng trống', () => {
    const csv = '﻿mssv,ho_ten,lop\r\n20210001,Trần Thị An,CNTT-K66\r\n\r\nb21dccn002,"Lê, Văn Bình",\r\n20210003,"Phạm ""Chi""","Lớp\nA"\n';
    const { rows, errors } = parseStudentCsv(csv);
    expect(errors).toEqual([]);
    expect(rows).toEqual([
      { line: 2, mssv: '20210001', fullName: 'Trần Thị An', classLabel: 'CNTT-K66' },
      { line: 4, mssv: 'B21DCCN002', fullName: 'Lê, Văn Bình', classLabel: null },
      { line: 5, mssv: '20210003', fullName: 'Phạm "Chi"', classLabel: 'Lớp\nA' },
    ]);
    expect(parseStudentCsv('20210001,An').rows).toHaveLength(1);
  });

  it('chuẩn hoá họ tên tiếng Việt dạng NFD về NFC', () => {
    const { rows } = parseStudentCsv(`20210001,${'Trần Thị Ánh'.normalize('NFD')}`);
    expect(rows[0]?.fullName).toBe('Trần Thị Ánh'.normalize('NFC'));
  });

  it('báo lỗi theo số dòng vật lý', () => {
    const { errors } = parseStudentCsv('mssv,ho_ten\n20210001\nsai mssv!,Tên\n20210002,Tên,Lớp,thừa\n,Không MSSV');
    expect(errors).toEqual([
      { line: 2, message: 'thiếu họ tên' },
      { line: 3, message: 'MSSV "sai mssv!" không hợp lệ' },
      { line: 4, message: 'thừa cột (chỉ có mssv, ho_ten, lop)' },
      { line: 5, message: 'thiếu MSSV' },
    ]);
  });

  it('báo file rỗng, thiếu ngoặc đóng, quá số dòng', () => {
    expect(parseStudentCsv('mssv,ho_ten\n').errors[0]?.message).toMatch(/không có sinh viên/);
    expect(parseStudentCsv('20210001,"An').errors[0]).toEqual({ line: 1, message: 'Thiếu dấu ngoặc kép đóng' });
    const big = Array.from({ length: MAX_IMPORT_ROWS + 1 }, (_, i) => `${i + 1},SV ${i}`).join('\n');
    expect(parseStudentCsv(big).errors[0]?.message).toMatch(/Quá 2000/);
  });
});

describe('giới hạn số lần sai', () => {
  it('chặn sau 10 lần sai trong 5 phút, mở lại khi hết cửa sổ, xoá khi thành công', () => {
    const clock = new FakeClock();
    const limiter = new FailureLimiter({ maxFailures: 10, windowMs: 5 * MINUTE }, clock);
    for (let i = 0; i < 9; i++) limiter.recordFailure('k');
    expect(() => limiter.assertAllowed('k')).not.toThrow();
    limiter.recordFailure('k');
    expect(() => limiter.assertAllowed('k')).toThrow(expect.objectContaining({ code: 'RATE_LIMITED', details: { retryAfterSeconds: 300 } }));
    expect(() => limiter.assertAllowed('khoa-khac')).not.toThrow();

    clock.advance(5 * MINUTE);
    expect(() => limiter.assertAllowed('k')).not.toThrow();

    for (let i = 0; i < 10; i++) limiter.recordFailure('k');
    limiter.reset('k');
    expect(() => limiter.assertAllowed('k')).not.toThrow();
  });
});
