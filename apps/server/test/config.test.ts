import { describe, expect, it } from 'vitest';
import { DEFAULT_LIMITS } from '@croc-classroom/shared';
import { ConfigError, limitEnvName, loadConfig } from '../src/config.js';
import { TEST_ENV } from './helpers.js';

describe('loadConfig', () => {
  it('dùng giá trị mặc định khi chỉ có cấu hình relay', () => {
    const config = loadConfig({ RELAY_ADDRESS: 'relay.test:9009', RELAY_PASS: 'mat-khau-relay' });
    expect(config).toMatchObject({
      host: '0.0.0.0',
      port: 3000,
      trustProxy: false,
      validateResponses: true,
      relay: { address: 'relay.test:9009', password: 'mat-khau-relay' },
      limits: DEFAULT_LIMITS,
    });
    expect(config.dbPath).toMatch(/data[/\\]db[/\\]croc-classroom\.sqlite$/);
  });

  it('báo mọi lỗi cùng lúc khi thiếu hoặc sai cấu hình', () => {
    try {
      loadConfig({ RELAY_ADDRESS: 'khong-co-cong', RELAY_PASS: 'ngan', PORT: 'abc' });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigError);
      const problems = (error as ConfigError).problems.join('\n');
      expect(problems).toMatch(/RELAY_ADDRESS/);
      expect(problems).toMatch(/RELAY_PASS/);
      expect(problems).toMatch(/PORT/);
    }
  });

  it('ghi đè giới hạn bằng biến LIMIT_*', () => {
    expect(limitEnvName('maxAssignmentBytes')).toBe('LIMIT_MAX_ASSIGNMENT_BYTES');
    const config = loadConfig({ ...TEST_ENV, LIMIT_MAX_SUBMISSION_BYTES: '1048576', LIMIT_VPS_DISTRIBUTION_SLOTS: '4' });
    expect(config.limits.maxSubmissionBytes).toBe(1048576);
    expect(config.limits.vpsDistributionSlots).toBe(4);
    expect(() => loadConfig({ ...TEST_ENV, LIMIT_VPS_TRANSFER_SLOTS: '-1' })).toThrow(/LIMIT_VPS_TRANSFER_SLOTS/);
  });

  it('chỉ tin proxy đã khai báo', () => {
    expect(loadConfig({ ...TEST_ENV, TRUST_PROXY: '172.16.0.0/12, 10.0.0.2' }).trustProxy).toEqual(['172.16.0.0/12', '10.0.0.2']);
  });
});
