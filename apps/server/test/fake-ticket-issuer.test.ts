import { describe, expect, it } from 'vitest';
import { IssuedTicketSchema } from '@croc-classroom/shared';
import { fixtureIds, fixtureManifest } from '@croc-classroom/shared/fixtures';
import { AppError } from '../src/http/errors.js';
import { FakeTicketIssuer } from '../src/testing/fake-ticket-issuer.js';

const clock = { now: () => new Date('2026-11-17T08:00:00.000Z') };

describe('FakeTicketIssuer (GIẢ — thay dịch vụ vé của D khi test nghiệp vụ C)', () => {
  it('cấp vé đúng schema, hạn theo công thức chung', async () => {
    const issuer = new FakeTicketIssuer(clock);
    const ticket = await issuer.openUpload({ assignmentId: fixtureIds.assignmentPublished, lecturerId: fixtureIds.lecturer, manifest: fixtureManifest, totalBytes: 10 });
    expect(IssuedTicketSchema.parse(ticket)).toMatchObject({ kind: 'gv_tai_len', expiresAt: '2026-11-17T08:02:00.000Z' });
    expect(issuer.issued).toHaveLength(1);
  });

  it('giả lập bể VPS đầy bằng CAPACITY_EXHAUSTED', async () => {
    const issuer = new FakeTicketIssuer(clock);
    issuer.full = true;
    await expect(
      issuer.openSubmission({ assignmentId: fixtureIds.assignmentPublished, studentId: fixtureIds.studentAn, manifest: fixtureManifest, totalBytes: 10 }),
    ).rejects.toSatisfy((e: unknown) => e instanceof AppError && e.code === 'CAPACITY_EXHAUSTED' && e.httpStatus === 503);
  });
});
