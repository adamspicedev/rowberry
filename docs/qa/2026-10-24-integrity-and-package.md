# Integrity audit and unsigned arm64 package — 24 October 2026

Application source: `db7f1d3c871da448ab3a599a267330728d30c506`, with the local `electron-builder.yml` change restricting the macOS target to arm64. Host: macOS 27.2 arm64. Existing disposable PostgreSQL 18 fixture only; temporary app profiles. No signing, installation replacement, publication or production database access.

## Packaging correction

The first `bun scripts/package.ts --mac --arm64` invocation still built Intel because the configuration explicitly listed both architectures. Changed the target to `arch: [arm64]`. The subsequent successful invocation logged only arm64 packaging and DMG creation. Old Intel artifacts from earlier builds are not qualified or intended for distribution.

Unsigned candidate identity:

- Installer: `release/Rowberry-0.1.0-mac-arm64.dmg`
- Installer SHA-256: `5ba3c3d523c97f223a8ac21688024e2aa6a88f370f88e6f36734706e4c2dda6f`
- app.asar SHA-256: `20514c077d4ee91b564bd79ba42a242e2a051de18ba81a3d53dd385aae72331f`
- Local development artifact only; not a retained accepted release baseline.

## Executed evidence

- `bun run test:integration tests/integration/writes.test.ts -t 'writes PostgreSQL 18'`: **14 passed**, 14 PostgreSQL 14 tests intentionally filtered out. Covers exact JSON/composite keys, rollback, generated fields, trigger refresh, row-level security denial, concurrent saves, deleted rows and connection loss around commit.
- Selected `json.spec.ts` and `save.spec.ts` desktop tests: **5 passed**. Includes PG18 precise/invalid JSON editing, worker cancellation/stale identity, guarded saves, oversized IPC rejection and lost COMMIT acknowledgement with retry blocked. The PG18 guarded-save scenario overlaps the earlier baseline and is not five entirely new scenarios.
- `bun run verify:package release/mac-arm64/Rowberry.app arm64 --assets-only`: **passed** architecture, assets, IPC and sandboxed renderer smoke. This command alone does not test database workflows.
- Packaged `connections.spec.ts` with `DBAPP_NATIVE_CREDENTIAL_TEST=1`: **5 passed**, including native Keychain write/read through a recreated entry and cleanup. This is real native available-store evidence, not a locked/denied-store test. The unavailable-store test uses simulation.

- Packaged `save.spec.ts`, filtered to PG18 guarded saves and lost COMMIT acknowledgement: **2 passed**. Confirms these database behaviours in the exact app archive identified above.

The worker measured 11,888,891 bytes / 100,000 scalars: parse 194.7 ms, search 20.4 ms, search cancellation 5.1 ms, parse cancellation 5.6 ms. UI expansion measured 26.9 ms and selection 9 ms. These are local observations, not an agreed release performance budget.

The prior schema test's 1024 × 768 dark-theme screenshot was visually inspected: menu and toast were within the window. This limited screenshot review does not establish full responsive or VoiceOver acceptance.

## Contract coverage and remaining work

| Contract                     | Evidence in this pass                                                      | Remaining                                                                                |
| ---------------------------- | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| A03 credentials              | Packaged native available-store round trip and connection lifecycle        | Actual denied/unavailable Keychain scenario, fresh-account qualification                 |
| A05 precise saves            | PG18 guarded saves and independent database assertions                     | Final-candidate and unfamiliar-user acceptance                                           |
| A06 conflict/unknown outcome | Concurrent/deleted row conflicts and real connection-loss regression tests | Final-candidate qualification                                                            |
| A07 stale operations         | Earlier connection attempt cannot unlock later save                        | Complete mapping of session switching and transaction/tab lifecycle cases                |
| A08 recovery                 | JSON guarded-save and source recovery scenarios                            | Complete Unicode/invalid/large-number interruption matrix and native participant session |
| A09 bounds/cancel            | Worker cancellation and large payload checks; measured timings             | Agreed reference-hardware budgets and memory acceptance                                  |
| A10 accessibility            | Existing keyboard tests plus limited screenshot review                     | VoiceOver and unfamiliar-user task observations                                          |

V1-04 and V1-05 remain open. Missing evidence is not automatically a code defect. Signing remains deferred by the maintainer; public distribution still requires qualification and approval.

## Branded installer and recovery follow-through

The branded DMG has SHA-256 `e43697704516f3cd08c9001120e7c5983d154aea6fbe96eb2c7058b809fbe354`; its application archive remains `20514c077d4ee91b564bd79ba42a242e2a051de18ba81a3d53dd385aae72331f`. The earlier installer hash above identifies the pre-branding build. Read-only mounting verified the image checksum, actual Rowberry application, Applications symlink, volume icon and exact generated background. The mount was ejected. Finder's complete rendered layout still needs visual acceptance.

Strengthened `tests/e2e/recovery.spec.ts` to support the packaged executable and included it in the standard package test selection. The invalid recovered JSON now includes Unicode and a large numeric literal, checked verbatim after restart. Explicit recovered-copy discard is checked against persisted workspace state and another restart. **Both packaged recovery tests passed** on the application archive above.

An initial test extension incorrectly treated closing live editors as deletion of retained recovery copies and timed out. The corrected test invokes “Discard recovered copies”; closing live editors intentionally preserves those copies. No application data-deletion change was made.

Typecheck and lint passed. Unit suite: **58 passed, 1 skipped**. The strengthened recovery checks cover seeded detached-copy persistence and explicit discard; they do not replace the full live-editor interruption matrix, VoiceOver checks or unfamiliar-participant sessions.
