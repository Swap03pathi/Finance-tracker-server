import * as fs from 'fs';
import * as path from 'path';

/**
 * Loads the doc 07 §6 rule lists from engine/config/*.json as DATA, not code — so they can be
 * updated without a release (doc 02 "living rule-set"). Resolves relative to this module so it
 * works under ts-jest (src/config) and compiled (dist/src/config) alike.
 */
const CONFIG_DIR = path.resolve(__dirname, '../../config');

const cache = new Map<string, unknown>();

export function loadConfig<T>(name: string): T {
  if (!cache.has(name)) {
    cache.set(name, JSON.parse(fs.readFileSync(path.join(CONFIG_DIR, name), 'utf8')));
  }
  return cache.get(name) as T;
}

export interface GateRules {
  transactionVerbs: string[];
  failedContext: string[];
  rejectOtpPromoFailed: string[];
  future: string[];
  conditional: string[];
  hold: string[];
  mandate: string[];
  refund: string[];
}

export interface SenderNormConfig {
  operatorPrefixes: string[];
  categorySuffixes: string[];
}

export interface OwnNodeConfig {
  ownNodeIssuers: string[];
}

export interface MerchantDict {
  merchants: Record<string, string>;
}
