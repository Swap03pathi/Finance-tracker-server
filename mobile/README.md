# mobile/ — Flutter Android app (Phase 9)

Built in **Phase 9** (parallelisable from Phase 4). Placeholder until the backend critical path
(Phases 1–4) is captured correctly.

## Planned device architecture (doc 07 §3)

Local SQLite (drift), offline-first:

- `local_raw_messages` — raw body, sender, sms timestamp, message_id, processed flag. **Never synced.** Backed up to the user's Google Drive.
- `local_template_cache` — trusted templates pulled from the shared library + any awaiting confirmation.
- `local_outbox` — structured entries pending sync (retryable queue).
- `local_state` — last-sync cursor, backfill checkpoint, own-node registry mirror.

Native Android `BroadcastReceiver` + WorkManager for real-time capture + the 14-day backfill sweep;
multipart SMS reassembled by concatenation reference **before** gating/fingerprinting (doc 07 §11).
Raw bodies stay device-local (SQLCipher) + the user's own Drive — never sent to our server.

> `flutter create` to be run here when Phase 9 begins. The parsing core is `@finman/engine` (portable).
