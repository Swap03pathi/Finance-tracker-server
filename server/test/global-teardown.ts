module.exports = async function globalTeardown() {
  const pg = (globalThis as any).__FINMAN_PG__;
  if (pg) await pg.stop();
};
