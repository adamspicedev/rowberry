# Recovery re-enable — 16 November 2026

## Reproduction and repair

On signed Rowberry 0.1.7, re-enabling **Recover drafts on this device** left stored SQL and drafts empty until another edit. The checkbox was enabled and all live editors still contained their work, but an unexpected process exit would lose those copies.

The regression used real SQL and JSON editors plus two table tabs. It first verified that SQL, invalid JSON containing Unicode and an exact large numeric literal, staged table values and unfinished cell text had reached local storage. Disabling recovery cleared them. Closing one SQL/JSON tab and discarding one table's edits while disabled succeeded. Re-enabling then failed the expected-content assertion: both stored arrays remained empty. The reproduction ran against the signed 0.1.7 package on PostgreSQL 18.

Version 0.1.8 observes the recovery setting in the existing editor snapshot effects. Open editors, including inactive tabs, capture their current contents when recovery is re-enabled. Only the boolean setting is observed; ordinary recovery writes do not rerender every editor. Closed editors do not participate, and disabling recovery still prevents content persistence.

This keeps the existing short save delay and error/retry handling. It does not promise recovery before persistence has acknowledged the content or automatically apply recovered work to PostgreSQL.

Review found a related initial-read failure: a JSON copy created before disabling recovery remained in the pending startup snapshot. Discarding its editor while recovery was off, then re-enabling and retrying the read, could persist that discarded copy again. A controlled storage regression reproduced it against an initially empty store. Disabling recovery now clears pending SQL and draft snapshots too; new live copies captured after re-enabling still survive the read retry. Existing stored-data merge behavior is unchanged.

## Source validation

Source commit: `9c89e69f490cc1fee4832da425c28d300b603bf2`.

- The new live-editor regression passed on PostgreSQL 14 and 18: **2 passed in 8.4 seconds**. It requires exact persisted contents before sending `SIGKILL` to the isolated main process, then relaunches the same disposable profile.
- Restart restores the invalid JSON, staged values and active cell text as detached copies. Reconnecting restores SQL text without running it. Separate database queries verify that no SQL insert or staged table write occurred.
- Closed SQL/JSON tabs and discarded table/cell edits remain absent after re-enable and restart.
- Default desktop suite: **17 passed, 1 native-vault opt-in test skipped**, in 23 seconds.
- Unit/storage suite: **76 passed, 1 native-vault opt-in test skipped**. All 11 workspace cases pass, including two new initial-read-failure cases for discarded and newly captured copies. The discarded-copy case failed before the pending-snapshot repair.
- Typecheck, lint, production build, tracked-file formatting and independent review passed. The whole-directory formatting command reports two unchanged, untracked files under `apps/web/.claude/`; those user-owned files were preserved.

## Candidate qualification

[PR #41](https://github.com/adamspicedev/rowberry/pull/41) merged after all required CI checks passed. Main commit `a5f5c9b1f341d4a9ae7879d119adb1ad46d91b77` has identical application and test source to the build commit above.

- Host: macOS 27.3, build `26C5035r`, arm64.
- Application: `release-signed/0.1.8/mac-arm64/Rowberry.app`.
- Installer: `release-signed/0.1.8/Rowberry-0.1.8-mac-arm64.dmg`.
- Final DMG SHA-256: `4f51bb26d9e84196ed846283c65341052894dba6c795d772b1eac4c7cb0ff0fb`.
- `app.asar` SHA-256: `1326ad1107e1c1ec38259477d5bb450040aff90b5ae969804b396584c774c844`.
- Embedded version: 0.1.8. All 15 bundled application files match the frozen build output.

```sh
DBAPP_NATIVE_CREDENTIAL_TEST=1 bun run verify:package /Users/spicey/Projects/dbapp/release-signed/0.1.8/mac-arm64/Rowberry.app arm64
```

**30 passed, zero skipped, in 1.7 minutes.** This includes available native Keychain checks, both new PostgreSQL 14/18 recovery-toggle cases, existing recovery and guarded-save regressions, connection workflows and security checks. Executable architecture, renderer assets, IPC and sandboxed renderer smoke also passed.

Both app and DMG passed Developer ID signature verification, Apple notarization, stapled-ticket validation and Gatekeeper assessment. The separately signed DMG submission `7f2bc828-57e0-4fa0-b839-9ed38b62d1c2` was Accepted. Its checksum was generated after final stapling.

A read-only mount verified the exact tested app archive, matching branded background and volume icon, Finder background reference and Applications link. The mounted app passed deep/strict signature and stapled-ticket validation. These embedded branding checks do not establish a fresh-account Finder installation.

Version 0.1.8 is the latest completed local app/installer record. These local artifacts are not a durable accepted baseline or a published release. Fresh-account installation, minimum-supported-OS coverage, native unavailable-store checks and final-release acceptance remain open.

The desktop regression begins after a successful workspace load. Initial-read failure/retry behavior uses controlled unit coverage, not a native disk failure. These tests do not establish persistence before acknowledgement, machine power-loss recovery, native VoiceOver behavior or final-release acceptance.
