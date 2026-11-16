# Session-only password warning — 16 November 2026

The primary Connect action saved metadata and a transient password, then replaced the storage outcome with “Connecting…” and “Connected.” The connection manager closed, leaving only a generic “Connection saved” toast. Users could miss that their password would be forgotten on quit.

## Change

Rowberry 0.1.4 carries the password-storage result separately from display text. A session-only result produces a connection-specific alert toast that remains until dismissed, including after the workspace opens. Ordinary metadata saves and securely stored passwords keep their existing success toast. The credential service and persistence policy are unchanged.

## Regression evidence

Two desktop cases reproduced the missing alert before the fix and passed afterward. Initial reproduction injected native API failures on macOS. The committed regression controls capability/fallback at the application bridge so it also runs on CI hosts without a native vault: one advertises unavailable storage, while the other advertises availability but returns a session-only result when saving was requested. Both use the real service's transient-secret handling and database authentication. These are controlled outcomes, not real macOS denied-write qualification; service-level failed-write handling has separate integration coverage.

Both cases connect through the primary UI action to PostgreSQL 18 using verified TLS, require the session-only alert after connection, advance the renderer clock beyond normal toast expiry, dismiss the warning, and restart. They verify the password is absent from the profile database files and the app cannot reconnect without it after restart. The existing connection-test workflow also passes, verifying that testing a connection preserves the active workspace.

- Focused desktop checks: **3 passed**.
- Typecheck and lint: **passed**.
- Native denied-read/retry evidence remains in [the separate 0.1.3 report](2026-11-16-native-keychain-denial.md).

Signed 0.1.4 package qualification is recorded separately once complete. Actual denied writes/deletion, locked/unavailable storage, fresh-account installation and final-release acceptance remain open.
