-- CreateEnum
CREATE TYPE "LineKind" AS ENUM ('bank', 'credit_pool', 'wallet', 'loan');

-- CreateEnum
CREATE TYPE "InstrumentKind" AS ENUM ('credit_card', 'debit_card', 'vpa', 'netbanking');

-- CreateEnum
CREATE TYPE "CounterpartyType" AS ENUM ('merchant', 'person', 'own_node', 'unknown');

-- CreateEnum
CREATE TYPE "Direction" AS ENUM ('EXPENSE', 'INCOME', 'TRANSFER', 'TOPUP');

-- CreateEnum
CREATE TYPE "Modality" AS ENUM ('actual', 'future', 'conditional', 'failed', 'hold', 'mandate');

-- CreateEnum
CREATE TYPE "EntrySource" AS ENUM ('sms', 'cash', 'manual', 'aa', 'email', 'statement');

-- CreateEnum
CREATE TYPE "NetStatus" AS ENUM ('active', 'reversed', 'is_reversal', 'settled');

-- CreateEnum
CREATE TYPE "SettlementKind" AS ENUM ('refund', 'reimbursement', 'split', 'self_transfer');

-- CreateEnum
CREATE TYPE "SettlementStatus" AS ENUM ('pending', 'partial', 'settled', 'written_off');

-- CreateEnum
CREATE TYPE "LiabilityKind" AS ENUM ('loan', 'card_emi');

-- CreateEnum
CREATE TYPE "DebtDirection" AS ENUM ('they_owe_me', 'i_owe_them');

-- CreateEnum
CREATE TYPE "DebtStatus" AS ENUM ('open', 'partial', 'closed', 'forgiven');

-- CreateEnum
CREATE TYPE "DiscrepancyType" AS ENUM ('missing_outflow', 'missing_inflow', 'suspected_emi', 'suspected_duplicate', 'suspected_refund', 'suspected_interest');

-- CreateEnum
CREATE TYPE "DiscrepancyStatus" AS ENUM ('open', 'resolved', 'ignored');

-- CreateEnum
CREATE TYPE "DiscrepancyResolution" AS ENUM ('labelled', 'manual_added', 'merged', 'netted', 'interest_confirmed', 'ignored');

-- CreateEnum
CREATE TYPE "TrustState" AS ENUM ('provisional', 'trusted', 'flagged');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "google_sub" TEXT NOT NULL,
    "display_name" TEXT,
    "email" TEXT,
    "backfill_window_days" INTEGER NOT NULL DEFAULT 14,
    "drive_backup_enabled" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lines" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "kind" "LineKind" NOT NULL,
    "issuer" TEXT,
    "display_name" TEXT,
    "current_balance" DECIMAL(14,2),
    "credit_limit" DECIMAL(14,2),
    "available_credit" DECIMAL(14,2),
    "is_own_node" BOOLEAN NOT NULL DEFAULT true,
    "balance_is_soft" BOOLEAN NOT NULL DEFAULT false,
    "accrues_daily_interest" BOOLEAN NOT NULL DEFAULT false,
    "interest_rate_daily" DECIMAL(12,10),
    "reconciliation_confidence" DECIMAL(5,4),
    "anchor_balance" DECIMAL(14,2),
    "anchored_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "instruments" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "line_id" UUID NOT NULL,
    "kind" "InstrumentKind" NOT NULL,
    "issuer" TEXT,
    "last4" TEXT,
    "vpa" TEXT,
    "holder" TEXT,
    "display_name" TEXT,
    "is_confirmed" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "instruments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "is_system" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tags" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "category_id" INTEGER NOT NULL,
    "created_by_user" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payees" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "normalized_key" TEXT NOT NULL,
    "raw_vpas" TEXT[],
    "display_name" TEXT,
    "default_category_id" INTEGER,
    "default_tag_id" UUID,
    "counterparty_type" "CounterpartyType" NOT NULL DEFAULT 'unknown',
    "is_user_confirmed" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ledger_entries" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "line_id" UUID NOT NULL,
    "instrument_id" UUID,
    "payee_id" UUID,
    "message_id" TEXT,
    "direction" "Direction" NOT NULL,
    "modality" "Modality" NOT NULL,
    "amount_captured" DECIMAL(14,2) NOT NULL,
    "amount_effective" DECIMAL(14,2) NOT NULL,
    "balance_after" DECIMAL(14,2),
    "category_id" INTEGER,
    "tag_id" UUID,
    "merchant_text" TEXT,
    "txn_time" TIMESTAMPTZ(6),
    "received_at" TIMESTAMPTZ(6),
    "source" "EntrySource" NOT NULL DEFAULT 'sms',
    "net_status" "NetStatus" NOT NULL DEFAULT 'active',
    "reverses_entry_id" UUID,
    "is_counted" BOOLEAN NOT NULL DEFAULT false,
    "template_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ledger_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settlements" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "base_entry_id" UUID NOT NULL,
    "settle_entry_id" UUID,
    "kind" "SettlementKind" NOT NULL,
    "expected_amount" DECIMAL(14,2),
    "settled_amount" DECIMAL(14,2),
    "status" "SettlementStatus" NOT NULL DEFAULT 'pending',
    "expected_at" TIMESTAMPTZ(6),
    "personal_debt_id" UUID,
    "note" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "settlements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "liabilities" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "kind" "LiabilityKind" NOT NULL,
    "repaid_via_line_id" UUID NOT NULL,
    "origin_entry_id" UUID,
    "principal" DECIMAL(14,2),
    "tenure_months" INTEGER,
    "installment_amount" DECIMAL(14,2),
    "remaining" DECIMAL(14,2),
    "is_user_declared" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "liabilities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "personal_debt" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "counterparty_name" TEXT,
    "direction" "DebtDirection" NOT NULL,
    "principal" DECIMAL(14,2),
    "remaining" DECIMAL(14,2),
    "status" "DebtStatus" NOT NULL DEFAULT 'open',
    "origin_purpose" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "personal_debt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "discrepancies" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "line_id" UUID NOT NULL,
    "type" "DiscrepancyType" NOT NULL,
    "magnitude" DECIMAL(14,2),
    "status" "DiscrepancyStatus" NOT NULL DEFAULT 'open',
    "resolution" "DiscrepancyResolution",
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "discrepancies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "templates" (
    "id" UUID NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "issuer" TEXT,
    "regex" TEXT NOT NULL,
    "slot_map" JSONB NOT NULL,
    "trust_state" "TrustState" NOT NULL DEFAULT 'provisional',
    "validation_runs" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "denylist_senders" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "sender_normalized" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "denylist_senders_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_google_sub_key" ON "users"("google_sub");

-- CreateIndex
CREATE INDEX "lines_user_id_idx" ON "lines"("user_id");

-- CreateIndex
CREATE INDEX "lines_user_id_issuer_idx" ON "lines"("user_id", "issuer");

-- CreateIndex
CREATE INDEX "instruments_user_id_issuer_last4_kind_idx" ON "instruments"("user_id", "issuer", "last4", "kind");

-- CreateIndex
CREATE INDEX "instruments_line_id_idx" ON "instruments"("line_id");

-- CreateIndex
CREATE UNIQUE INDEX "categories_name_key" ON "categories"("name");

-- CreateIndex
CREATE INDEX "tags_user_id_idx" ON "tags"("user_id");

-- CreateIndex
CREATE INDEX "payees_user_id_idx" ON "payees"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "payees_user_id_normalized_key_key" ON "payees"("user_id", "normalized_key");

-- CreateIndex
CREATE INDEX "ledger_entries_user_id_txn_time_idx" ON "ledger_entries"("user_id", "txn_time");

-- CreateIndex
CREATE INDEX "ledger_entries_line_id_idx" ON "ledger_entries"("line_id");

-- CreateIndex
CREATE INDEX "ledger_entries_payee_id_idx" ON "ledger_entries"("payee_id");

-- CreateIndex
CREATE INDEX "ledger_entries_user_id_is_counted_net_status_idx" ON "ledger_entries"("user_id", "is_counted", "net_status");

-- CreateIndex
CREATE INDEX "settlements_user_id_idx" ON "settlements"("user_id");

-- CreateIndex
CREATE INDEX "settlements_base_entry_id_idx" ON "settlements"("base_entry_id");

-- CreateIndex
CREATE INDEX "settlements_settle_entry_id_idx" ON "settlements"("settle_entry_id");

-- CreateIndex
CREATE INDEX "liabilities_user_id_idx" ON "liabilities"("user_id");

-- CreateIndex
CREATE INDEX "personal_debt_user_id_idx" ON "personal_debt"("user_id");

-- CreateIndex
CREATE INDEX "discrepancies_user_id_status_idx" ON "discrepancies"("user_id", "status");

-- CreateIndex
CREATE INDEX "discrepancies_line_id_idx" ON "discrepancies"("line_id");

-- CreateIndex
CREATE UNIQUE INDEX "templates_fingerprint_key" ON "templates"("fingerprint");

-- CreateIndex
CREATE INDEX "templates_issuer_idx" ON "templates"("issuer");

-- CreateIndex
CREATE INDEX "denylist_senders_user_id_idx" ON "denylist_senders"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "denylist_senders_user_id_sender_normalized_key" ON "denylist_senders"("user_id", "sender_normalized");

-- AddForeignKey
ALTER TABLE "lines" ADD CONSTRAINT "lines_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "instruments" ADD CONSTRAINT "instruments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "instruments" ADD CONSTRAINT "instruments_line_id_fkey" FOREIGN KEY ("line_id") REFERENCES "lines"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tags" ADD CONSTRAINT "tags_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tags" ADD CONSTRAINT "tags_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payees" ADD CONSTRAINT "payees_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payees" ADD CONSTRAINT "payees_default_category_id_fkey" FOREIGN KEY ("default_category_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payees" ADD CONSTRAINT "payees_default_tag_id_fkey" FOREIGN KEY ("default_tag_id") REFERENCES "tags"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_line_id_fkey" FOREIGN KEY ("line_id") REFERENCES "lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_instrument_id_fkey" FOREIGN KEY ("instrument_id") REFERENCES "instruments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_payee_id_fkey" FOREIGN KEY ("payee_id") REFERENCES "payees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "tags"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_reverses_entry_id_fkey" FOREIGN KEY ("reverses_entry_id") REFERENCES "ledger_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_base_entry_id_fkey" FOREIGN KEY ("base_entry_id") REFERENCES "ledger_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_settle_entry_id_fkey" FOREIGN KEY ("settle_entry_id") REFERENCES "ledger_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_personal_debt_id_fkey" FOREIGN KEY ("personal_debt_id") REFERENCES "personal_debt"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "liabilities" ADD CONSTRAINT "liabilities_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "liabilities" ADD CONSTRAINT "liabilities_repaid_via_line_id_fkey" FOREIGN KEY ("repaid_via_line_id") REFERENCES "lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "liabilities" ADD CONSTRAINT "liabilities_origin_entry_id_fkey" FOREIGN KEY ("origin_entry_id") REFERENCES "ledger_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "personal_debt" ADD CONSTRAINT "personal_debt_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discrepancies" ADD CONSTRAINT "discrepancies_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discrepancies" ADD CONSTRAINT "discrepancies_line_id_fkey" FOREIGN KEY ("line_id") REFERENCES "lines"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "denylist_senders" ADD CONSTRAINT "denylist_senders_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

