import { Decimal, rupeesToPaise, paiseToRupees, Paise } from '@finman/engine';

/**
 * Money boundary helpers. The engine computes in integer paise; Prisma stores NUMERIC(14,2) and the
 * wire carries rupee strings. Conversions live here so no other code does ad-hoc money math (doc 07 §1).
 */
export const wireToPaise = (s: string): Paise => rupeesToPaise(s);
export const paiseToWire = (p: Paise): string => paiseToRupees(p).toFixed(2);

/** Prisma Decimal columns accept a rupee string; reading gives a Prisma.Decimal-like with toString(). */
export const paiseToDb = (p: Paise): string => paiseToRupees(p).toFixed(2);
export const dbToPaise = (d: { toString(): string } | null | undefined): Paise | null =>
  d == null ? null : rupeesToPaise(new Decimal(d.toString()));
