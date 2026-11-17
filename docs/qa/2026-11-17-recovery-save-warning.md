# Recovery save warning ordering — 17 November 2026

## Reproduction

A valid workspace save can wait behind another main-process operation, including credential access. Meanwhile, the preload validates newer requests immediately. When a newer SQL draft exceeds the 1 MiB limit, that save fails before the older valid save replies.

The renderer previously let every reply replace the recovery warning. The controlled regression reproduced the older success clearing the newer failure: live SQL still contained 1,048,577 characters, the saved snapshot contained only `SELECT previously_valid`, and both the warning and retry control state disappeared. No real Keychain delay or disk failure was induced.

## Repair

Version 0.1.9 tracks workspace save attempts and lets only the latest attempt update the recovery warning. Older requests still return their own result; the repair does not cancel writes or replace live text. The regression uses the real command-size and schema validation, holds the first valid save, verifies the newer warning survives that older reply, and verifies a corrected save persists the current SQL and clears the warning.

The separate initial-read merge remains unchanged: unread stored copies are retained after a read failure, as the error explains. Turning recovery off clears pending live copies, and clearing disk recovery is confirmed only after a successful read/save. See [local data and recovery](../data-storage.md).

## Validation

- Before the fix, the new regression failed when the older reply cleared the warning.
- After the fix, all 77 unit/storage tests passed; one opt-in native-vault test was skipped. The workspace suite contains 12 passing cases.
- Type checking, lint and the application build passed.
- Resumed verification on 17 November: all 77 unit/storage tests passed again (one opt-in native-vault test skipped), along with type checking, lint, tracked-file formatting and the application build. The strict documentation build also passed.
- Both source desktop recovery tests passed: process-crash recovery of acknowledged JSON without executing SQL, and cancellation/explicit discard of recovered unsaved work. These tests exercise the development Electron application; they do not qualify the signed 0.1.9 installer or reproduce the save-reply race through native storage.

The regression controls reply timing at the renderer bridge boundary; it does not qualify actual locked or denied native storage. Signed 0.1.9 package results are recorded below. The retained 0.1.8 installer and its recorded checks are unchanged. Fresh-account installation remains deferred at the maintainer's request; this source repair does not close that gate.

## Signed candidate qualification

Application source commit: `d6e34a3696cfe34d17fc3d549635268cf601cbe2`. Host: macOS 27.3 (`26C5035r`), arm64.

- App: `release-signed/0.1.9/mac-arm64/Rowberry.app`.
- Installer: `release-signed/0.1.9/Rowberry-0.1.9-mac-arm64.dmg`.
- Final stapled DMG SHA-256: `4b120efcee59648fff80b1ea4e2050f265193cd28261c336630bcc55adfa01f7`.
- App archive SHA-256: `a91a5919a5a13cae040499caca937d466af93bb644bbe79af89481f78463c80d`.
- Embedded version is 0.1.9; all 14 checked build assets (JavaScript, HTML, CSS, SVG, fonts and text) match the local build output.
- Full integration suite: **124 passed, one opt-in native-vault test skipped**.
- `DBAPP_NATIVE_CREDENTIAL_TEST=1 bun run verify:package release-signed/0.1.9/mac-arm64/Rowberry.app arm64`: **30 passed, zero skipped, in 1.7 minutes**, including native Keychain, PostgreSQL 14/18, recovery, guarded-save and security workflows.
- Negative package checks correctly rejected a missing worker, enabled renderer Node integration and a missing executable, using temporary copies.
- Both app and installer passed signature verification, Apple notarization, stapled-ticket validation and Gatekeeper assessment. DMG submission `f8534de4-1daa-40f3-8d4f-5f4c66e3f0b6` was Accepted. The installer checksum was generated after stapling.
- Read-only installer inspection confirmed the tested app archive, matching background and volume icon, and Applications link. The mounted app passed deep/strict signature and stapled-ticket checks.

Version 0.1.9 is now the latest locally verified candidate. Version 0.1.8 remains the privately retained candidate. This run does not qualify fresh-account installation, supported-OS coverage, actual unavailable native storage, VoiceOver Home navigation or final-release acceptance. No remote CI, publication or accepted-baseline promotion occurred in this follow-up. The save-reply race itself remains covered by the controlled source regression, not an induced native-storage failure.
