// Runs in each jest worker before tests so PrismaService connects to the embedded Postgres.
import { DATABASE_URL } from './e2e-db';
process.env.DATABASE_URL = DATABASE_URL;
process.env.JWT_SECRET = 'e2e-secret-at-least-16-chars-long'; // satisfies the >=16 char fail-closed check
