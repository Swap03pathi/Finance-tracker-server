/**
 * @finman/engine — framework-agnostic SMS parsing + ledger core (the reference spec, doc 10 §0).
 * Public surface re-exported here so consumers (the NestJS server, and the Dart port's vector tests)
 * import from `@finman/engine` rather than deep paths.
 */
export const ENGINE_VERSION = '0.2.0';

export * from './money';
export * from './types';
export * from './amount/parseAmount';
export * from './gating/senderNormalisation';
export * from './gating/gate';
export * from './fingerprint/mask';
export * from './fingerprint/fingerprint';
export * from './redaction/redact';
export * from './classification/modality';
export * from './classification/moneyType';
export * from './ledger/counted';
export * from './ledger/idempotentId';
export * from './ledger/store';
export * from './aggregation/aggregate';
export * from './aggregation/period';
export * from './settlement/settle';
export * from './reconciliation/reconcile';
export * from './reconciliation/interest';
export * from './templates/induction';
export * from './payee/payee';
export * from './parsing/dateParse';
export * from './parsing/multipart';
export * from './auth/verifyToken';
export * from './config/loadConfig';
