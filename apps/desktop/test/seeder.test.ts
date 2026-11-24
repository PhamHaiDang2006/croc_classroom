import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WebSocketServer } from 'ws';
import { expect, it, vi } from 'vitest';
import { ClientMessageSchema, WS_SUBPROTOCOL, type ClientMessage } from '@croc-classroom/shared';
import { fixtureClientConfig } from '@croc-classroom/shared/fixtures';
import { computeManifest } from '@croc-classroom/shared/node';
import { createLoopbackEngine } from '@croc-classroom/croc-engine/testing';
import { Connection } from '../src/main/socket.js';
import { LocalFiles } from '../src/main/files.js';
import { Jobs } from '../src/main/jobs.js';
import { RestClient } from '../src/main/rest.js';

it('announces verified payloads and serves the requested ticket over authenticated WebSocket', async () => {
  const root = await mkdtemp(join(tmpdir(), 'classroom-seeder-'));
  const server = new WebSocketServer({ host: '127.0.0.1', port: 0, path: '/ws' });
  await once(server, 'listening');
  const addr = server.address();
  if (!addr || typeof addr === 'string') throw new Error('Missing loopback address');
  const origin = 'http://127.0.0.1:' + addr.port;
  const token = randomUUID();
  const api = new RestClient(origin, token);
  const files = new LocalFiles(root, root);
  const engine = createLoopbackEngine();
  const jobs = new Jobs(
    api,
    engine,
    files,
    fixtureClientConfig,
    () => ({
      serverUrl: origin,
      workDir: root,
      collectDir: root,
      seedingEnabled: true,
      seedingConcurrency: 1,
    }),
    () => {},
    () => {},
    () => [],
  );
  const client = new Connection(
    jobs,
    () => {},
    () => {},
    false,
  );
  const messages: ClientMessage[] = [];
  try {
    const id = randomUUID(),
      ticketId = randomUUID(),
      dir = join(root, 'payload'),
      out = join(root, 'out');
    await mkdir(dir);
    await mkdir(out);
    await writeFile(join(dir, 'đề.txt'), 'đề');
    await files.keep(id, dir, await computeManifest(dir));
    const connected = once(server, 'connection');
    client.connect();
    const [peer, request] = await connected;
    expect(request.headers.authorization === 'Bearer ' + token).toBe(true);
    expect(peer.protocol).toBe(WS_SUBPROTOCOL);
    peer.on('message', (raw: Buffer) => messages.push(ClientMessageSchema.parse(JSON.parse(raw.toString()))));
    await vi.waitFor(() => expect(messages[0]?.type).toBe('hello'));
    peer.send(
      JSON.stringify({
        type: 'welcome',
        userId: randomUUID(),
        serverTime: new Date().toISOString(),
        heartbeatSeconds: 30,
      }),
    );
    await vi.waitFor(() => expect(messages).toContainEqual({ type: 'seed.announce', assignmentIds: [id] }));
    const code = engine.generateCode();
    const receive = engine.receive({ code, relay: fixtureClientConfig.relay, outDir: out, timeoutMs: 5000 });
    peer.send(
      JSON.stringify({
        type: 'serve.request',
        assignmentId: id,
        ticketId,
        crocCode: code,
        expiresAt: new Date(Date.now() + 5000).toISOString(),
      }),
    );
    expect((await receive.done).ok).toBe(true);
    expect(await readFile(join(out, 'đề.txt'), 'utf8')).toBe('đề');
    await vi.waitFor(() => expect(messages).toContainEqual({ type: 'serve.result', ticketId, ok: true }));
  } finally {
    client.stop();
    for (const peer of server.clients) peer.terminate();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await jobs.stop();
    await rm(root, { recursive: true, force: true });
  }
});
