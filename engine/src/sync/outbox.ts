import { LedgerEntry } from '../types';

/**
 * Offline-first outbox (doc 07 §3/§4, doc 08 §V). Parse + store locally ALWAYS; sync is a separate,
 * retryable step that drains the queue when online. Entries carry a device-generated id so a drain
 * retry upserts idempotently rather than duplicating.
 */
export class Outbox {
  private queue: LedgerEntry[] = [];
  private online = false;

  enqueue(entry: LedgerEntry): void {
    this.queue.push(entry);
  }

  setOnline(value: boolean): void {
    this.online = value;
  }

  pending(): number {
    return this.queue.length;
  }

  /** Drain to the server sink when online; returns how many were flushed. No-op while offline. */
  drain(sink: (entry: LedgerEntry) => void): number {
    if (!this.online) return 0;
    let n = 0;
    while (this.queue.length > 0) {
      sink(this.queue.shift()!);
      n++;
    }
    return n;
  }
}
