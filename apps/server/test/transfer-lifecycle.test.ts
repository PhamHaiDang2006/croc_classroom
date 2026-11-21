import { afterEach, expect, it, vi } from 'vitest';
import { fixtureManifest } from '@croc-classroom/shared/fixtures';
import { pendingPayloadCleanup } from '../src/ports/assignment-lifecycle.js';
import { activatedStudents, serverHarness, MINUTE, type AccountsHarness } from './helpers.js';

let h: AccountsHarness;
afterEach(async () => { await h?.app.close(); });

async function setup() {
  h = await serverHarness();
  const gv = await h.loginLecturer();
  const students = await activatedStudents(h, gv, ['20210001']);
  const studentId = students['20210001']!.id;
  const created = await h.call('POST', '/assignments', { token: gv, body: { title: 'Lifecycle', deadlineAt: null, manifest: fixtureManifest } });
  expect(created.statusCode, created.body).toBe(201);
  const { assignment, ticket } = created.json();
  const event = { ticketId: ticket.ticketId as string, assignmentId: assignment.id as string,
    storageRef: 'assignments/original', verifiedAt: h.clock.now().toISOString() };
  return { gv, studentId, id: event.assignmentId, event, code: assignment.codePhrase as string };
}

async function published() {
  const w = await setup();
  await h.outcomes.onUploadStored(w.event);
  h.assignments.service.join(w.studentId, w.code, '127.0.0.1');
  return w;
}

async function submission(w: { id: string; studentId: string }) {
  const { ticket } = await h.submissions.service.submit(w.studentId, w.id, fixtureManifest);
  const event = { ticketId: ticket.ticketId, assignmentId: w.id, studentId: w.studentId,
    manifest: fixtureManifest, storageRef: `submissions/${ticket.ticketId}`, verifiedAt: h.clock.now().toISOString() };
  return { ticket, event };
}

it('rejects superseded upload and atomically commits only the current ticket; retry returns stored ref', async () => {
  const w = await setup();
  const lecturer = h.db.prepare("SELECT id FROM users WHERE role = 'lecturer'").get() as { id: string };
  const { ticket } = await h.assignments.service.renewUploadTicket(lecturer.id, w.id);
  expect((await h.outcomes.onUploadStored(w.event)).accepted).toBe(false);
  const event = { ...w.event, ticketId: ticket.ticketId, storageRef: 'assignments/new' };
  expect(await h.outcomes.onUploadStored(event)).toEqual({ accepted: true, alreadyCommitted: false, storageRef: event.storageRef });
  expect(h.db.prepare('SELECT status FROM tickets WHERE id = ?').get(ticket.ticketId)).toEqual({ status: 'xong' });
  expect(await h.outcomes.onUploadStored({ ...event, storageRef: 'wrong-retry-path' }))
    .toEqual({ accepted: true, alreadyCommitted: true, storageRef: event.storageRef });
});

it('rejects expired upload even before the expiry sweep updates ticket status', async () => {
  const w = await setup();
  h.clock.advance(3 * MINUTE);
  expect((await h.outcomes.onUploadStored(w.event)).accepted).toBe(false);
  expect(h.assignments.service.get(w.id).status).toBe('dang_tai_len');
});

it('rejects wrong assignment, wrong kind and deleted upload callbacks', async () => {
  const w = await setup();
  expect((await h.outcomes.onUploadStored({ ...w.event, assignmentId: 'missing' })).accepted).toBe(false);
  h.db.prepare("UPDATE tickets SET kind = 'nop_bai' WHERE id = ?").run(w.event.ticketId);
  expect((await h.outcomes.onUploadStored(w.event)).accepted).toBe(false);
  await h.assignments.service.delete(w.id);
  expect((await h.outcomes.onUploadStored(w.event)).accepted).toBe(false);
});

it('rejects expired submission without creating a receipt', async () => {
  const w = await published();
  const { event } = await submission(w);
  h.clock.advance(3 * MINUTE);
  expect((await h.outcomes.onSubmissionStored(event)).accepted).toBe(false);
  expect(() => h.submissions.service.myReceipt(w.studentId, w.id)).toThrow();
});

it('keeps a durable delete marker after purge failure; blocks new transfers and allows retry', async () => {
  const w = await published();
  const { event } = await submission(w);
  const purge = vi.spyOn(h.issuer, 'purgeAssignment').mockRejectedValueOnce(new Error('disk unavailable'));
  await expect(h.assignments.service.delete(w.id)).rejects.toThrow('disk unavailable');
  expect(h.db.prepare('SELECT deleting FROM assignments WHERE id = ?').get(w.id)).toEqual({ deleting: 1 });
  await expect(h.submissions.service.submit(w.studentId, w.id, fixtureManifest)).rejects.toThrow();
  expect((await h.outcomes.onSubmissionStored(event)).accepted).toBe(false);
  expect(() => h.assignments.service.join(w.studentId, w.code, '127.0.0.1')).toThrow();
  await h.assignments.service.delete(w.id);
  expect(purge).toHaveBeenCalledTimes(2);
  expect(h.db.prepare('SELECT id FROM assignments WHERE id = ?').get(w.id)).toBeUndefined();
});

it('serializes opening collect with replacement, and persists cleanup until collect finishes', async () => {
  const w = await published();
  const first = await submission(w);
  const result = await h.outcomes.onSubmissionStored(first.event);
  if (!result.accepted) throw new Error('expected commit');
  const next = await submission(w);
  const lecturer = h.db.prepare("SELECT id FROM users WHERE role = 'lecturer'").get() as { id: string };
  const original = h.issuer.openCollect.bind(h.issuer);
  let release!: () => void;
  let entered!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const started = new Promise<void>((resolve) => { entered = resolve; });
  vi.spyOn(h.issuer, 'openCollect').mockImplementation(async (request) => {
    entered();
    await gate;
    return original(request);
  });
  const collectPromise = h.submissions.service.collect(lecturer.id, result.receipt.submissionId);
  await started;
  let committed = false;
  const replacement = h.outcomes.onSubmissionStored(next.event).then((value) => { committed = true; return value; });
  await Promise.resolve();
  expect(committed).toBe(false);
  release();
  const collect = await collectPromise;
  expect((await replacement).accepted).toBe(true);
  expect(h.db.prepare('SELECT storage_ref FROM payload_gc').all()).toEqual([{ storage_ref: first.event.storageRef }]);
  expect(pendingPayloadCleanup(h.db, w.id)).toEqual([]);
  // A duplicate submission callback cannot erase the durable cleanup record.
  await h.outcomes.onSubmissionStored(next.event);
  await h.outcomes.onCollectConfirmed({ ticketId: collect.ticket.ticketId,
    submissionId: result.receipt.submissionId, confirmedAt: h.clock.now().toISOString() });
  expect(pendingPayloadCleanup(h.db, w.id)).toEqual([{ storage_ref: first.event.storageRef }]);
});

it('rejects a collect acknowledgement for an unrelated ticket', async () => {
  const w = await published();
  const first = await submission(w);
  const result = await h.outcomes.onSubmissionStored(first.event);
  if (!result.accepted) throw new Error('expected commit');
  await h.outcomes.onCollectConfirmed({ ticketId: first.ticket.ticketId,
    submissionId: result.receipt.submissionId, confirmedAt: h.clock.now().toISOString() });
  expect(h.db.prepare('SELECT collected_at FROM submissions').get()).toEqual({ collected_at: null });
});
