# V1 integrity coverage map — 24 October 2026

This maps the M2 scenarios to executable evidence and remaining acceptance gaps. It is not final signed-release qualification. The tested application code is unchanged between source `db7f1d3c871da448ab3a599a267330728d30c506` and PR #8 head `fc2e6dfc0f2ad19b4f144d05a1812d4924e57715`; the former also included unrelated website analytics work, which was excluded from PR #8.

| Scenario                       | Coverage                                                                                                                                                                                                                             | Current limit                                                                                                 |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| Stale connection/tab ownership | `query-dispatch.test.ts` rejects stale generations; `query.spec.ts` invalidates pending fetches on session replacement; `connections.spec.ts` prevents earlier connection completion unlocking a later save                          | Final signed candidate and uncoached feedback still pending                                                   |
| Concurrent update/delete       | `writes.test.ts` checks conflicts, deleted rows, consumed versions, composite keys and batch rollback; `save.spec.ts` checks visible guarded-save outcomes                                                                           | Final candidate qualification pending                                                                         |
| Unknown write outcome          | `writes.test.ts` cuts connections around COMMIT; `save.spec.ts` drops a real COMMIT acknowledgement and blocks automatic retry; `queries.test.ts` checks socket loss during mutation                                                 | These controlled network failures do not cover every infrastructure failure                                   |
| Interrupted/recovered work     | `query.spec.ts` checks query recovery; `json.spec.ts` checks precise/invalid edits; `save.spec.ts` covers unexpected window destruction and detached recovery; `recovery.spec.ts` preserves seeded invalid Unicode/large-number text | A single live-editor crash scenario combining every text edge case is not established by the seeded-copy test |
| Durable discard                | `recovery.spec.ts` invokes explicit recovered-copy discard, checks storage and restarts; `save.spec.ts` checks outgoing recovery IDs and draft discard                                                                               | Closing live editors intentionally differs from deleting retained copies                                      |
| Credentials                    | Packaged `connections.spec.ts` native Keychain round trip; simulated unavailable-store regression; credential unit tests for failed probes                                                                                           | Real denied/locked-store acceptance remains blocked; do not substitute simulation                             |
| Transactions and cancellation  | `queries.test.ts` checks commit/rollback, failed/expired cancellation, backend retirement, portal closure and tab rollback; `query.spec.ts` tests UI warning and isolated transactions                                               | Unfamiliar users must still understand the consequences                                                       |
| Bounded results and JSON       | Query byte/page limits, bounded RETURNING output, large IPC rejection, worker cancellation and precise numeric tests                                                                                                                 | Numeric performance/memory budgets and sustained-session acceptance remain open                               |

## Fresh local execution

`bun run test:integration tests/integration/writes.test.ts tests/integration/queries.test.ts tests/integration/query-dispatch.test.ts`: **64 passed** across disposable PostgreSQL 14 and 18.

All five `sessions.spec.ts` scenarios passed: four against the existing PG18 TLS fixture and the reload/backend teardown scenario against a new PG14 fixture. An initial run lacked PG14; the next used PG18's CA for PG14 and correctly failed certificate verification. Supplying PG14's own manifest resolved the setup error. No application TLS weakening or bypass was introduced.

The fixtures had different certificate directories, so session tests were selected per fixture rather than claiming one all-green invocation. The temporary PG14 fixture is removed after verification; the pre-existing PG18 fixture is retained.

## Remaining V1-05 work

Coverage mapping is complete for the listed M2 scenarios, but the milestone remains open: establish performance budgets on recorded reference hardware, complete the live-editor interruption combinations, obtain actual denied-store evidence when access permits, and requalify the final release candidate. No new implementation bug was established by these passing tests.

## Full unsigned package verification

`DBAPP_NATIVE_CREDENTIAL_TEST=1 bun run verify:package release/mac-arm64/Rowberry.app arm64`: **25 passed**, plus executable/architecture/assets/IPC/sandbox smoke. Tests used the application archive SHA-256 `20514c077d4ee91b564bd79ba42a242e2a051de18ba81a3d53dd385aae72331f`. The branded DMG identity is recorded in the [package report](2026-10-24-integrity-and-package.md). This includes both PG14/18 guarded saves, query sessions and JSON workflows, recovery, native available-store round trip, menus and security checks.

Native Finder visual inspection was attempted but the desktop-control transport was unavailable. Image contents and the generated background were verified earlier; full Finder layout acceptance is still pending. Signing, denied Keychain access and unfamiliar-participant tasks remain separate open gates.
