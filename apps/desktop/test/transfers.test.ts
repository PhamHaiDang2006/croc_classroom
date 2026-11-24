import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { it, expect, vi } from 'vitest';
import { createLoopbackEngine } from '@croc-classroom/croc-engine/testing';
import type { TransferEvent } from '@croc-classroom/shared';
import { fixtureClientConfig, fixtureIssuedTicket, fixtureTicketInfo } from '@croc-classroom/shared/fixtures';
import { Jobs } from '../src/main/jobs.js';
import { LocalFiles } from '../src/main/files.js';
import { RestClient } from '../src/main/rest.js';

it.each([true, false])(
  'submit succeeds only when the worker returns a receipt (receipt=%s)',
  async (withReceipt) => {
    const dir = await mkdtemp(join(tmpdir(), 'classroom-submit-'));
    try {
      const api = new RestClient('http://localhost');
      const engine = createLoopbackEngine();
      const events: TransferEvent[] = [];
      const ticket = {
        ...fixtureIssuedTicket,
        kind: 'nop_bai' as const,
        ticketId: fixtureTicketInfo.ticketId,
        crocCode: engine.generateCode(),
        expiresAt: new Date(Date.now() + 10000).toISOString(),
      };
      const info = { ...fixtureTicketInfo, receipt: withReceipt ? fixtureTicketInfo.receipt : null };
      vi.spyOn(api, 'call').mockResolvedValue(info);
      const files = new LocalFiles(dir, dir);
      const jobs = new Jobs(
        api,
        engine,
        files,
        fixtureClientConfig,
        () => ({
          serverUrl: api.origin,
          workDir: dir,
          collectDir: dir,
          seedingEnabled: true,
          seedingConcurrency: 1,
        }),
        (e) => events.push(e),
        () => {},
        () => [],
      );
      const input = join(dir, 'input'),
        output = join(dir, 'output');
      await mkdir(input);
      await mkdir(output);
      await writeFile(join(input, 'answer'), 'payload');
      const receiver = engine.receive({
        relay: fixtureClientConfig.relay,
        code: ticket.crocCode,
        outDir: output,
        timeoutMs: 10000,
      });
      const { operationId } = jobs.submit(ticket, input);
      await jobs.running.get(operationId)!.done;
      expect((await receiver.done).ok).toBe(true);
      expect(events.at(-1)?.phase).toBe(withReceipt ? 'succeeded' : 'failed');
      if (withReceipt) {
        expect(events.at(-1)?.receipt).toEqual(info.receipt);
        expect(JSON.parse(await readFile(join(dir, 'receipts', ticket.assignmentId), 'utf8'))).toEqual(
          info.receipt,
        );
      }
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  },
);
