/**
 * Seed: the fixed system taxonomy (doc 04 §3.4 / doc 07 §9).
 *
 * Only the 12 system categories live in the DB. The own-node wallet senders and the
 * merchant-VPA dictionary are CLASSIFICATION REFERENCE DATA used on-device too, so they live
 * as engine config (engine/config/*.json), not DB rows.
 *
 * Idempotent: safe to re-run (upsert on Category.name).
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// doc 04 §3.4 / doc 07 §9 — the ~12 fixed roll-up buckets for the dashboard.
const SYSTEM_CATEGORIES = [
  'Food',
  'Shopping',
  'Rent',
  'Utilities',
  'Travel',
  'Healthcare',
  'Entertainment',
  'Investments',
  'Education',
  'Loans',
  'Insurance',
  'Miscellaneous',
];

async function main() {
  for (const name of SYSTEM_CATEGORIES) {
    await prisma.category.upsert({
      where: { name },
      update: { isSystem: true },
      create: { name, isSystem: true },
    });
  }
  const count = await prisma.category.count();
  // eslint-disable-next-line no-console
  console.log(`Seeded system categories. Total categories: ${count}`);
}

main()
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
