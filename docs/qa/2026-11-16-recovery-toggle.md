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

Signed 0.1.8 package checks are pending. The [0.1.7 record](2026-11-16-connection-delete-keyboard.md#candidate-qualification) remains the latest completed local installer verification until this section is updated.

The desktop regression begins after a successful workspace load. Initial-read failure/retry behavior uses controlled unit coverage, not a native disk failure. These tests do not establish persistence before acknowledgement, machine power-loss recovery, native VoiceOver behavior or final-release acceptance.
