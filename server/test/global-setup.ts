import EmbeddedPostgres from 'embedded-postgres';
import { execSync } from 'child_process';
import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import { DATABASE_URL, PG_DIR, PG_PORT } from './e2e-db';

const SYSTEM_CATEGORIES = [
  'Food', 'Shopping', 'Rent', 'Utilities', 'Travel', 'Healthcare',
  'Entertainment', 'Investments', 'Education', 'Loans', 'Insurance', 'Miscellaneous',
];

/** Boot a real embedded Postgres, apply the Prisma migration, seed categories. */
module.exports = async function globalSetup() {
  fs.rmSync(PG_DIR, { recursive: true, force: true });
  fs.mkdirSync(PG_DIR, { recursive: true });

  const pg = new EmbeddedPostgres({ databaseDir: PG_DIR, user: 'finman', password: 'finman', port: PG_PORT, persistent: false });
  await pg.initialise();
  await pg.start();
  await pg.createDatabase('finman');
  (globalThis as any).__FINMAN_PG__ = pg;

  const serverDir = path.resolve(__dirname, '..');
  execSync('npx prisma migrate deploy', { cwd: serverDir, env: { ...process.env, DATABASE_URL }, stdio: 'inherit' });

  const prisma = new PrismaClient({ datasources: { db: { url: DATABASE_URL } } });
  for (const name of SYSTEM_CATEGORIES) {
    await prisma.category.upsert({ where: { name }, update: {}, create: { name, isSystem: true } });
  }
  await prisma.$disconnect();
};
