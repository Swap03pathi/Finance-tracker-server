// PM2 process config (doc 10 §0 — EC2 + PM2). Build first (`npm run build`), then `pm2 start`.
// Secrets come from the EC2 environment / .env on the box — NEVER committed.
module.exports = {
  apps: [
    {
      name: 'finman-server',
      script: 'dist/src/main.js', // nest build emits under dist/src (prisma/ sits outside src)
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production',
        PORT: '3000',
      },
      error_file: 'logs/err.log',
      out_file: 'logs/out.log',
      time: true,
    },
  ],
};
