import * as os from 'os';
import * as path from 'path';

/** Fixed connection for the embedded Postgres used by e2e tests (doc 10 §1.E, no Docker/RDS). */
export const PG_PORT = 59433;
export const PG_DIR = path.join(os.tmpdir(), 'finman-e2e-pg');
export const DATABASE_URL = `postgresql://finman:finman@localhost:${PG_PORT}/finman?schema=public`;
