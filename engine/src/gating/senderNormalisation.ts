import { loadConfig, SenderNormConfig } from '../config/loadConfig';

/**
 * Sender normalisation (doc 06 Phase 1, doc 07 §6). Strips DLT operator prefix (`VM-`) and
 * trailing category suffix (`-S`) to the registered entity (`HDFCBK`), so the same bank is handled
 * identically regardless of routing. Detects 10-digit numeric = personal sender (always dropped).
 */
export interface NormalisedSender {
  kind: 'personal' | 'dlt';
  entity: string | null; // the registered entity for DLT (e.g. HDFCBK); null for personal
}

const cfg = (): SenderNormConfig => loadConfig<SenderNormConfig>('sender-normalisation.json');

/** A personal sender is a 10-digit (optionally +91) phone number. */
export function isPersonalSender(sender: string): boolean {
  const digits = sender.replace(/[\s-]/g, '').replace(/^\+?91/, '').replace(/^\+/, '');
  return /^\d{10}$/.test(digits);
}

export function normaliseSender(sender: string): NormalisedSender {
  const raw = (sender ?? '').trim();
  if (isPersonalSender(raw)) {
    return { kind: 'personal', entity: null };
  }
  const { operatorPrefixes, categorySuffixes } = cfg();
  // DLT headers look like VM-HDFCBK, BZ-HDFCBK-S, AD-SBIINB. Split on hyphen.
  const parts = raw.toUpperCase().split('-').filter(Boolean);
  if (parts.length === 1) {
    return { kind: 'dlt', entity: parts[0] };
  }
  // drop a leading operator prefix (known, or any 2-letter token)
  if (operatorPrefixes.includes(parts[0]) || /^[A-Z]{2}$/.test(parts[0])) {
    parts.shift();
  }
  // drop a trailing single-letter category suffix
  if (parts.length > 1 && categorySuffixes.includes(parts[parts.length - 1])) {
    parts.pop();
  }
  return { kind: 'dlt', entity: parts.join('-') || null };
}
