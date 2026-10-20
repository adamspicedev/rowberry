# Task 9 — Workspace recovery and polish

Base: `84c7f35`. Display name remains Rowberry; internal protocol/profile paths remain `dbapp`. No licensing changes, remote publication or JSON scheduling changes.

## Implementation and API

- Added strict version-1 `WorkspaceSchema` and trusted `workspace.load` / `workspace.save` IPC operations. The main-owned `profiles.sqlite` migration adds one workspace row; updates run in an immediate transaction. Recovery-disabled saves strip all SQL and value draft content at the main boundary. SQLite secure deletion is enabled.
- Renderer persistence debounces by 300 ms and reports read/write errors with Retry controls while retaining live editor text. A real SQLite FULL regression exposed SQLite's automatic rollback, so rollback now checks whether the transaction remains active.
- Restores system/light/dark appearance, SQL/table workspace visibility and SQL text. Startup restores no connection, row cache, result cache, query execution or mutation. SQL text enters a dedicated session only after explicit Connect.
- JSON (including invalid text), unstaged cell text and staged table values are recorded as detached copy-only recovery text. Staged values exclude opaque row targets. The recovery dialog exposes exact local text for copying and explicit keep/discard choices; it cannot save to a database. Applying a recovered value requires reopening the current database value, comparing it, and using the existing guarded workflow.
- Disabling recovery removes persisted SQL/value copies, removes the legacy SQL browser key and blocks future draft persistence. Live editors still retain text in memory. Enabled legacy SQL is migrated transactionally before its key is removed; it never becomes a disabled-recovery fallback.
- Nonempty SQL counts as unsaved editor work even when an explicitly named query copy exists. SQL tab, connection/table and Disconnect transitions confirm unsaved work; native window-close/quit offers Keep editing or explicit discard. Quit still drains the database worker. Tests explicitly discard live editors during teardown rather than bypassing protection in production.
- Added a keyboard command menu (Cmd/Ctrl+K), modal focus behavior, active connection identity, recovery labels and matching utility/dialog styling. Existing named-query list remains alphabetically organized and paginated.
- Storage open/migration/directory failures show a native Quit/temporary-workspace choice and preserve the original file. Temporary mode uses only SQLite memory. `docs/data-storage.md` documents locations, sensitivity, legacy migration, recovery semantics and failure handling.

## Tests and evidence

Before implementation:

- `bun run test tests/integration/workspace.test.ts`: expected RED, `workspaceSave is not a function` (1 failed).
- First focused Electron attempt in the filesystem sandbox could not launch Electron; reran using the normal app-launch escalation. This was an environment launch failure, not a behavior assertion.

Final/covering checks:

- `bun run test`: **46 passed, 1 skipped** across 10 files. The skip is the pre-existing explicit native-vault opt-in. Includes workspace renderer failure/privacy tests, real SQLite workspace restart/privacy/corruption/FULL tests, existing migration rollback tests and JSON/protocol tests.
- `bun run test tests/integration/workspace.test.ts`: **4 passed** after adding the raw-file secure-deletion sentinel assertion. Real `PRAGMA max_page_count` produces SQLITE_FULL; the prior transaction value and caller's live draft survive. Corrupt bytes remain unchanged after rejection. File reopening restores invalid JSON verbatim; disabling removes its sentinel from the SQLite bytes.
- `bun run test src/renderer/app/workspace.test.ts tests/integration/workspace.test.ts`: **6 passed**. The renderer bridge failure preserves invalid live text and presents actionable guidance. Disabled recovery persists neither SQL nor JSON and removes the legacy key.
- `bun run test:e2e`: **11 passed** on final UI build, including two recovery tests, connection metadata, main validation, security, appearance and font/accessibility checks.
- `bun run test:e2e tests/e2e/recovery.spec.ts`: **2 passed**. Actual Electron restart restores invalid JSON as a detached copy, with no connected/query UI; disabling removes all recoverable text. Native close cancellation retains the copy and explicit discard closes the window. Native dialog choices are stubbed to deterministic responses while the real Electron beforeunload/close path runs.
- `bun run test:e2e:postgres`: **12 passed, 2 failed** in the complete live run. Both failures were the old SQL test auto-dismissing the newly required dirty-tab discard confirmation, leaving a second tab. Updated those deliberate close steps to accept and test teardown to explicitly discard editors.
- `bun run test:e2e:postgres tests/e2e/query.spec.ts`: **2 passed** after that correction (PostgreSQL 14 and 18). Together with the other 12 passing tests, all 14 completed live behavior cases have passing coverage. No claim of a single final all-green 14-case run.
- `bun run typecheck`, `bun run lint`, `bun run format:check`, `git diff --check`: **passed**. Production builds passed; Vite retains its existing large Monaco bundle warning.

All Electron suites ran sequentially. On resume, fixture ports were down because OrbStack was stopped. Started OrbStack, inspected the existing `dbapp.disposable=task3` containers, and restarted only `dbapp-task3-pg14-cDSumY` / `dbapp-task3-pg18-cDSumY` from `/tmp/dbapp-task3-fixtures.json`. Existing certificate validity was Oct 19 21:08:53 through Oct 21 21:08:53 UTC 2026, so no regeneration or new fixture provisioning was needed. Earlier connection-refused failures were environmental and are superseded by the live run above. No user database was accessed.

## Actual visual inspection

Launched the actual application against disposable PG18 with a temporary `task9_visual.projects` table containing realistic project names/status/JSON settings. Inspected `/tmp/rowberry-task9-workspace.png` and `/tmp/rowberry-task9-commands.png`: table/sidebar typography, purple selection, active connection badge and utility controls match the existing Prisma Studio direction. Corrected the command dialog centering and checkbox alignment after the first screenshot, then captured and inspected the final centered dialog. The script dropped its temporary schema, removed its temporary app profile and closed its application. These screenshots are local evidence outside the commit.

## Limits

- Local evidence is macOS arm64, PG14/18. Windows/Linux native dialogs, Intel runtime, signing/package qualification and CI remain Task 10 work.
- Recovery is bounded to 16 SQL tabs and 32 value copies, each at most 1 MiB, with a 64 MiB serialized IPC ceiling. Oversized/overflow persistence fails visibly while live editor state remains; no oldest-copy eviction occurs. Drafts from the final debounce interval can be lost in a crash; explicit close warns before discarding live work.
- Recovered cell/JSON text is copy-only; there is no automatic target rebinding or save replay. Original row/result caches are not persisted. Connection/table lists are reloaded only after explicit connection.
- SQLite secure deletion cannot remove external backups/filesystem snapshots. Disabling recovery leaves explicitly named saved queries intact.
- Recovery read errors require a successful Retry before persistence resumes, preserving unreadable stored state rather than silently replacing it. A temporary workspace cannot permanently persist profiles/queries/drafts.
- `RESUME.md` is controller-owned and deliberately excluded from this task's commit.

## Review fix round 1 (base `e30dae2`)

Addressed both Important findings and the dialog focus improvement:

1. Rereading a stored workspace after a failed save could replace newer local copies with older disk content. Reads are now restricted to initial-load recovery; save failures expose only Retry saving. The load API also refuses a subsequent reread after initialization, so stale callers cannot destroy local work. When an initial read failed and editing continued, the eventual successful read merges pending local drafts with stored copies and preserves newer local values. Concurrent initial reads cannot replace an already initialized workspace.
2. The original raw-file deletion assertion was a false positive: its sentinel had never been written. Corrected the test to save the actual invalid-JSON sentinel, assert that its bytes are present before disabling, and then assert their removal. The earlier report's secure-deletion evidence should be read as superseded by this positive-control test.
3. Recovery now uses the native modal-dialog focus lifecycle, closes with Keep/Escape, restores focus to its opener and blocks background actions while open. The covering Electron test checks initial/reopened textarea focus and restoration to the Review button before changing the privacy setting.

Covering evidence only; unchanged live/full suites were not repeated:

- RED `bun run test src/renderer/app/workspace.test.ts tests/integration/workspace.test.ts`: **1 failed, 5 passed**. The failed-save → newer local copy → read retry regression lost the newer text before the fix. The corrected real SQLite sentinel test passed with both presence/removal assertions.
- GREEN same command after the merge/retry fixes and initial-load regression: **7 passed**.
- `bun run build`: **passed**, retaining the existing Monaco bundle warning.
- `bun run test:e2e tests/e2e/recovery.spec.ts`: **2 passed**, including modal focus/restoration and native close cancel/discard.
- `bun run typecheck`, `bun run lint`, `bun run format:check`, `git diff --check`: **passed**.

## Review fix round 2 (base `805c889`)

Separated legacy migration failures from workspace read/save errors. A failed legacy migration now exposes **Retry legacy SQL migration**, which retries only the legacy key against the current live workspace; it never rereads the older SQLite snapshot. Existing SQL and newly created local drafts are retained. Recovered legacy SQL is merged into live state before awaiting its transactional save, so edits and debounce saves during that request include the recovered SQL. Failed storage keeps both the in-memory recovery and original browser key. The key is removed only on success; disabled recovery still removes it without reading its contents. Read/save retry buttons are now limited to their corresponding error states.

Covering checks:

- RED `bun run test src/renderer/app/workspace.test.ts`: **1 failed, 3 passed**. A failed legacy migration followed by retry did not recover legacy SQL.
- GREEN same command with the dedicated migration retry, newer SQL and closed-editor JSON copy regression: **4 passed**. The test proves both current and legacy SQL are saved with the latest local draft, clears the browser key only after success, and checks that a migration failure does not incorrectly offer a save retry.
- `bun run test src/renderer/app/workspace.test.ts src/renderer/features/query/query-state.test.ts`: **5 passed**.
- `bun run typecheck`, `bun run lint`, `bun run format:check`, `git diff --check`: **passed**.

No unchanged full/live Electron suites were repeated for this state-machine correction.
