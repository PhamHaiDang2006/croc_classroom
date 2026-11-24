import { WS_CLOSE } from '@croc-classroom/shared';
import { createAccounts } from './accounts/index.js';
import { buildApp } from './app.js';
import { createAssignments } from './assignments/index.js';
import { ConfigError, loadConfig } from './config.js';
import { migrate, openDatabase } from './db/index.js';
import { createTransferOutcomeHandler } from './outcomes.js';
import { systemClock } from './ports/clock.js';
import { createSubmissions } from './submissions/index.js';
import type { TicketIssuer } from './ports/transfers.js';
import { FakeTicketIssuer } from './testing/fake-ticket-issuer.js';
import { Distribution } from './distribution/service.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const db = openDatabase(config.dbPath);
  const applied = migrate(db);
  const clock = systemClock;

  const fakeTransfers = config.devFakeTransfers ? new FakeTicketIssuer(clock, db) : undefined;
  const distribution = fakeTransfers ? undefined : new Distribution(db, config);
  const tickets: TicketIssuer = fakeTransfers ?? distribution!;

  const accounts = createAccounts({ db, clock });
  const assignments = createAssignments({ db, clock, limits: config.limits, tickets, seeding: distribution });
  const submissions = createSubmissions({ db, clock, limits: config.limits, tickets });
  const outcomes = createTransferOutcomeHandler({ assignments: assignments.service, submissions: submissions.service });
  fakeTransfers?.autoComplete(outcomes);
  if(distribution){distribution.outcomes=outcomes;await distribution.start();}
  const purged = accounts.sessions.purgeExpired();

  const app = await buildApp({
    config,
    db,
    clock,
    sessions: accounts.sessions,
    modules: [accounts.routes, assignments.routes, submissions.routes, ...(distribution ? [distribution.routes] : [])],
  });
  if (applied.length > 0) app.log.info({ applied }, 'Đã áp dụng migration');
  if (purged > 0) app.log.info({ purged }, 'Đã xoá phiên hết hạn');
  if (fakeTransfers) {
    app.log.warn(
      'DEV_FAKE_TRANSFERS=true: dịch vụ vé GIẢ — tải đề, nộp bài, thu bài tự "thành công" mà không truyền file. Không dùng trên VPS thật.',
    );
  }

  distribution?.peers.attach(app.server,accounts.sessions,config.trustProxy);
  const unsubscribe=accounts.sessions.onUserSessionsRevoked(user=>{
    for(const p of distribution?.peers.online??[])if(p.auth.userId===user)p.socket.close(WS_CLOSE.revoked);
  });
  let closing = false;
  const shutdown = async (signal: string) => {
    if (closing) return;
    closing = true;
    app.log.info({ signal }, 'Đang tắt server');
    unsubscribe();
    await distribution?.close();
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
