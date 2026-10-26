# Recovery storage limits — 26 October 2026

Recovery validation failures previously showed disk-space advice, even when a draft exceeded a configured size or count limit. The app now distinguishes validation limits from storage failures and explains how to preserve work before reducing drafts or removing unneeded copies. Existing limits are unchanged.

Nine workspace tests pass, including oversized ASCII, oversized UTF-8, 33 recovered copies and 17 SQL tabs. They use the real command schema and message boundary, verify that failed saves preserve both the exact live state and the last stored snapshot, and verify saving resumes after correction. Existing disk-failure guidance remains covered.

Both packaged SQL workflow scenarios pass on PostgreSQL 14 and 18. The new case pastes a draft one byte above 1 MiB through the editor's paste event, verifies the limit warning, reads the unchanged persisted SQL independently, and copies the whole live selection through the editor's copy event to verify its exact contents. Synthetic clipboard events do not modify the system clipboard. A smaller replacement clears the warning before the remaining SQL/session/recovery scenarios run.

The initial typing-API attempt timed out while injecting a megabyte; the paste path completed normally. An initial full-content assertion also failed because Monaco exposes only 500 characters in that accessibility textarea. The final test checks the selected model contents through copy instead. These driver failures are not counted as passing runs.

Typecheck, lint and formatting pass. Unsigned Apple-silicon package built with this change on base `3f629742b13354a59dc2dae1fceea2bc43652746`:

- DMG SHA-256: `e256125033ec26ea78406c2b4567405850480cb0b36bbb8c167601298b7b70eb`.
- `app.asar` SHA-256: `8009de1a208c5523a6a907e2403021d657b49a6466889d78cae53edb0c9c57f5`.

This verifies recoverability and guidance at configured limits, not persistence of drafts above those limits, native disk failure, or final-release acceptance.
