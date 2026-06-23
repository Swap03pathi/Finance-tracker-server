/**
 * Multipart / concatenated SMS reassembly (doc 07 §11, doc 08 §E). Long SMS arrive as multiple parts;
 * they must be reassembled by the concatenation reference id BEFORE gating/fingerprinting, or we'd
 * fingerprint half a message. Parts may arrive out of order; a missing part is flagged, never half-parsed.
 */
export interface SmsPart {
  refId: string; // concatenation reference
  partIndex: number; // 1-based
  totalParts: number;
  text: string;
}

export interface ReassemblyResult {
  refId: string;
  complete: boolean;
  body: string | null; // null when incomplete (flagged, never half-parsed)
  missing: number[];
}

export function reassemble(parts: SmsPart[]): ReassemblyResult {
  const refId = parts[0]?.refId ?? '';
  const total = parts[0]?.totalParts ?? parts.length;
  const byIndex = new Map<number, string>();
  for (const p of parts) byIndex.set(p.partIndex, p.text);
  const missing: number[] = [];
  for (let i = 1; i <= total; i++) if (!byIndex.has(i)) missing.push(i);
  if (missing.length > 0) {
    return { refId, complete: false, body: null, missing };
  }
  const body = Array.from({ length: total }, (_, i) => byIndex.get(i + 1)).join('');
  return { refId, complete: true, body, missing: [] };
}
