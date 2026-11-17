import { createAccounts } from './accounts/index.js';
import { buildApp } from './app.js';
import { createAssignments } from './assignments/index.js';
import { ConfigError, loadConfig } from './config.js';
import { migrate, openDatabase } from './db/index.js';
import { systemClock } from './ports/clock.js';
import type { TicketIssuer } from './ports/transfers.js';
import { FakeTicketIssuer } from './testing/fake-ticket-issuer.js';
import { unavailableTicketIssuer } from './transfers-placeholder.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const db = openDatabase(config.dbPath);
  const applied = migrate(db);
  const clock = systemClock;

  // Dịch vụ vé + VPS worker của D chưa có: dùng bản báo "chưa sẵn sàng", hoặc bản giả khi phát triển.
  const fakeTransfers = config.devFakeTransfers ? new FakeTicketIssuer(clock) : undefined;
  const tickets: TicketIssuer = fakeTransfers ?? unavailableTicketIssuer;

  const accounts = createAccounts({ db, clock });
  const assignments = createAssignments({ db, clock, limits: config.limits, tickets });
  fakeTransfers?.autoPublish(assignments.service);
  const purged = accounts.sessions.purgeExpired();

  const app = await buildApp({
    config,
    db,
    clock,
    sessions: accounts.sessions,
    modules: [accounts.routes, assignments.routes],
  });
  if (applied.length > 0) app.log.info({ applied }, 'Đã áp dụng migration');
  if (purged > 0) app.log.info({ purged }, 'Đã xoá phiên hết hạn');
  if (fakeTransfers) {
    app.log.warn('DEV_FAKE_TRANSFERS=true: dịch vụ vé GIẢ, bài tự phát hành mà không truyền file. Không dùng trên VPS thật.');
  }

  let closing = false;
  const shutdown = async (signal: string) => {
    if (closing) return;
    closing = true;
    app.log.info({ signal }, 'Đang tắt server');
    await app.close();
    db.close();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  await app.listen({ host: config.host, port: config.port });
}

main().catch((error: unknown) => {
  if (error instanceof ConfigError) {
    console.error(error.message);
  } else {
    console.error(error);
  }
  process.exit(1);
});
