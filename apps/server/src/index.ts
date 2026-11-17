import { buildApp } from './app.js';
import { ConfigError, loadConfig } from './config.js';
import { migrate, openDatabase } from './db/index.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const db = openDatabase(config.dbPath);
  const applied = migrate(db);
  const app = await buildApp({ config, db });
  if (applied.length > 0) app.log.info({ applied }, 'Đã áp dụng migration');

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
