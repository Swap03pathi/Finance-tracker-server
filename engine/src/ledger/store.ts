import { Line, Instrument, LedgerEntry, LineKind, InstrumentKind } from '../types';
import { Paise } from '../money';

/**
 * Window for SUGGESTING (not auto-merging) near-duplicate entries — distinct from the exact dedup
 * key in idempotentId.ts. Wider, because a same-amount/same-merchant pair within a couple of minutes
 * is worth flagging for the user to confirm.
 */
const SUSPECTED_DUP_WINDOW_SEC = 120;

let seq = 0;
const nextId = (prefix: string) => `${prefix}-${++seq}`;

/**
 * In-memory ledger store — auto-discovery of lines/instruments, idempotent upsert, parse-correction,
 * and conservative shared-pool merge (doc 03 §4, doc 08 §I/§U/§V). The server persists the same
 * shapes via Prisma; this is the framework-free system-of-record logic the matrix exercises.
 */
export class LedgerStore {
  readonly lines: Line[] = [];
  readonly instruments: Instrument[] = [];
  readonly entries = new Map<string, LedgerEntry>();

  // ── auto-discovery ───────────────────────────────────────────────────────
  /** Bank line keyed by (issuer, account tail). Debit cards + VPAs on one account share it. */
  ensureBankLine(userId: string, issuer: string, acctTail: string | null): Line {
    const key = `bank|${issuer}|${acctTail ?? '?'}`;
    return this.findOrCreateLine(userId, key, { kind: 'bank', issuer, balanceIsSoft: false });
  }

  /** Each credit instrument gets its OWN pool by default (conservative; merge only on confirm). */
  ensureCreditLine(userId: string, issuer: string, poolKey: string): Line {
    const key = `credit|${issuer}|${poolKey}`;
    return this.findOrCreateLine(userId, key, { kind: 'credit_pool', issuer, balanceIsSoft: false });
  }

  ensureWalletLine(userId: string, issuer: string): Line {
    const key = `wallet|${issuer}`;
    return this.findOrCreateLine(userId, key, { kind: 'wallet', issuer, balanceIsSoft: true });
  }

  /** Missing last-4 → an "unattributed at <issuer>" bucket line, never a guessed card (LINE-07). */
  unattributedLine(userId: string, issuer: string): Line {
    const key = `unattributed|${issuer}`;
    return this.findOrCreateLine(userId, key, { kind: 'bank', issuer, balanceIsSoft: true, displayName: `Unattributed at ${issuer}` });
  }

  private lineKeyMap = new Map<string, string>(); // key -> lineId

  private findOrCreateLine(
    userId: string,
    key: string,
    init: { kind: LineKind; issuer?: string; balanceIsSoft: boolean; displayName?: string },
  ): Line {
    const existing = this.lineKeyMap.get(`${userId}|${key}`);
    if (existing) return this.lines.find((l) => l.id === existing)!;
    const line: Line = {
      id: nextId('line'),
      userId,
      kind: init.kind,
      issuer: init.issuer,
      displayName: init.displayName,
      isOwnNode: true,
      balanceIsSoft: init.balanceIsSoft,
      accruesDailyInterest: false,
    };
    this.lines.push(line);
    this.lineKeyMap.set(`${userId}|${key}`, line.id);
    return line;
  }

  /** Instrument keyed by (issuer,last4,kind) — NOT globally unique, distinct per issuer (LINE-08). */
  ensureInstrument(
    userId: string,
    lineId: string,
    spec: { kind: InstrumentKind; issuer?: string; last4?: string | null; vpa?: string | null; holder?: string },
  ): Instrument {
    const found = this.instruments.find(
      (i) =>
        i.userId === userId &&
        i.kind === spec.kind &&
        (spec.vpa ? i.vpa === spec.vpa : i.issuer === spec.issuer && i.last4 === (spec.last4 ?? null)),
    );
    if (found) return found;
    const inst: Instrument = {
      id: nextId('inst'),
      userId,
      lineId,
      kind: spec.kind,
      issuer: spec.issuer,
      last4: spec.last4 ?? undefined,
      vpa: spec.vpa ?? undefined,
      holder: spec.holder,
      isConfirmed: false,
    };
    this.instruments.push(inst);
    return inst;
  }

  // ── shared pool (conservative: default separate; merge only on user confirm) ─────────────
  /** Suggest a shared limit when two same-issuer credit pools' available limits track each other. */
  suggestSharedPool(a: Line, b: Line): boolean {
    return (
      a.kind === 'credit_pool' &&
      b.kind === 'credit_pool' &&
      a.issuer === b.issuer &&
      a.id !== b.id &&
      a.availableCreditPaise != null &&
      a.availableCreditPaise === b.availableCreditPaise
    );
  }

  /** User confirms: move instruments of `mergeLineId` onto `keepLineId`; both cards draw one pool. */
  confirmSharedPool(keepLineId: string, mergeLineId: string): Line {
    for (const inst of this.instruments) {
      if (inst.lineId === mergeLineId) {
        inst.lineId = keepLineId;
        inst.isConfirmed = true;
      }
    }
    for (const e of this.entries.values()) {
      if (e.lineId === mergeLineId) e.lineId = keepLineId;
    }
    const idx = this.lines.findIndex((l) => l.id === mergeLineId);
    if (idx >= 0) this.lines.splice(idx, 1);
    return this.lines.find((l) => l.id === keepLineId)!;
  }

  // ── entries: idempotent upsert + correction ──────────────────────────────
  upsertEntry(entry: LedgerEntry): LedgerEntry {
    this.entries.set(entry.id, { ...(this.entries.get(entry.id) ?? {}), ...entry });
    return this.entries.get(entry.id)!;
  }

  /** Parse-correction (EDIT-01/05): write amount_effective, NEVER touch amount_captured. */
  applyCorrection(entryId: string, newEffectivePaise: Paise): LedgerEntry {
    const e = this.entries.get(entryId);
    if (!e) throw new Error(`no entry ${entryId}`);
    e.amountEffectivePaise = newEffectivePaise; // captured stays frozen
    return e;
  }

  /** Suspected duplicates: same (line, amount, merchant) within window, distinct ids — SUGGEST only. */
  suspectedDuplicates(windowSec = SUSPECTED_DUP_WINDOW_SEC): Array<[string, string]> {
    const pairs: Array<[string, string]> = [];
    const list = [...this.entries.values()];
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i];
        const b = list[j];
        if (
          a.id !== b.id &&
          a.lineId === b.lineId &&
          a.amountCapturedPaise === b.amountCapturedPaise &&
          (a.merchantText ?? '') === (b.merchantText ?? '') &&
          a.txnTime &&
          b.txnTime &&
          Math.abs(Date.parse(a.txnTime) - Date.parse(b.txnTime)) <= windowSec * 1000
        ) {
          pairs.push([a.id, b.id]);
        }
      }
    }
    return pairs;
  }

  list(): LedgerEntry[] {
    return [...this.entries.values()];
  }
}
