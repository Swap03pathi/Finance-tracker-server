# Infra Runbook — EC2 + PM2 + RDS (doc 10 Phase 0)

Target: a NestJS server on **EC2** under **PM2**, talking to **RDS PostgreSQL**, with `GET /health`
green over HTTPS. Single box is fine for a friends/family pilot (not HA); RDS gives managed
backups/failover so they aren't hand-rolled.

> **Secrets** (DB password, OpenAI key, Google client id) live only in the EC2 `.env` / environment —
> never in the repo, never in the app. `git push` and any `prisma migrate` against RDS are manual.

## 1. RDS PostgreSQL (billed — confirm before creating)
- Engine: PostgreSQL 16, `db.t4g.micro` (pilot), 20 GB gp3, single-AZ (pilot) or Multi-AZ (later).
- DB name `finman`, master user `finman`, strong password (store in a secrets manager / `.env`).
- Security group `finman-rds-sg`: inbound 5432 **only** from the EC2 instance's SG (not 0.0.0.0/0).
- Note the endpoint → goes into `DATABASE_URL` with `sslmode=require`.

## 2. EC2 (billed — confirm before creating)
- `t3.small` Amazon Linux 2023, in the same VPC/subnet as RDS.
- Security group `finman-ec2-sg`: inbound 443 (HTTPS) from the world, 22 (SSH) from your IP only.
- Install: Node 20+, `npm i -g pm2`, nginx (TLS termination + reverse proxy to :3000), certbot.

## 3. Deploy
```bash
# on the EC2 box
git clone <repo> && cd finman
npm ci
cp server/.env.example server/.env   # fill in RDS endpoint, password, keys
npm run build --workspace server
cd server
npx prisma migrate deploy            # applies prisma/migrations/0_init to RDS  (manual, billed)
pm2 start ecosystem.config.js
pm2 save && pm2 startup              # restart on reboot
```
- nginx: reverse-proxy `https://<host>/` → `http://127.0.0.1:3000/`; certbot for the TLS cert.

## 4. Verify (Phase 0 exit)
```bash
curl https://<host>/health
# => {"status":"ok","db":"up","ts":"..."}   ← app reachable AND RDS round-trip works
```

## 5. What blocks me (needs your AWS access)
Provisioning EC2 and deploying are **billed, hard-to-reverse** actions in YOUR account. To execute
them I need: AWS credentials (or you run the `aws`/SSH steps), the region, and a VPC/subnet choice. I
will pause for sign-off before each create/deploy step. Until then, everything above is prepared and
the app builds locally; only the live provisioning + migrate + PM2 start remain.

## 6. Decision change + current block (2026-06-23)
- **DB: self-hosted PostgreSQL on the EC2 box** (user decision), NOT RDS. This is a deliberate
  deviation from doc 10 §0 — it loses managed backups/failover; revisit before real users. The
  user-data bootstrap installs postgresql15 + creates the `finman` DB/role locally on the instance.
- **Target instance:** `t4g.micro` (ARM, ~$6/mo on-demand, free-tier-trial eligible) — cheapest micro.
- **BLOCKED:** the `personal` profile's IAM user `surveillance-deployer` has an **explicit Deny** on
  `ec2:RunInstances` (policy `surveillance-deployer-policy`) and no RDS access, so a new instance
  cannot be launched with it. Unblock by loosening that policy, supplying a profile with EC2-launch
  rights, or reusing the existing `surveillance` instance.
- **Already prepared (free, nothing billed):** keypair `finman-deploy` (`~/.ssh/finman-deploy.pem`),
  SG `sg-02c1cf6290f98b7fa` (22←deployer IP, 80/443←public), AMI `ami-0bba2fc7fccad71a7`,
  bootstrap `user-data`, DB password (`~/.ssh/finman-db-password.txt`). One `run-instances` + the SSH
  deploy completes Phase 0 once access is fixed.
