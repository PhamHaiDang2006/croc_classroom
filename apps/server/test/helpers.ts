import type { FastifyInstance } from 'fastify';
import { buildApp, type AppDeps } from '../src/app.js';
import { loadConfig, type ServerConfig } from '../src/config.js';
import { migrate, openDatabase, type Db } from '../src/db/index.js';

export const TEST_ENV = {
  RELAY_ADDRESS: 'relay.test:9009',
  RELAY_PASS: 'mat-khau-relay-test',
  DB_PATH: ':memory:',
  LOG_LEVEL: 'silent',
} as const;

export function testConfig(overrides: Record<string, string> = {}): ServerConfig {
  return loadConfig({ ...TEST_ENV, ...overrides });
}

export function testDb(): Db {
  const db = openDatabase(':memory:');
  migrate(db);
  return db;
}

export async function testApp(deps: Partial<AppDeps> = {}): Promise<{ app: FastifyInstance; db: Db }> {
  const db = deps.db ?? testDb();
  const app = await buildApp({ config: testConfig(), db, ...deps });
  return { app, db };
}
