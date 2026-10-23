# V1 evidence register

Started 23 October 2026 for [V1-01](../v1-todo.md). This register separates evidence already recorded from qualification still required by the [release contract](../v1-release-contract.md). It is a planning inventory, not a new test run.

Signing is deferred by the maintainer as of 24 October 2026 due to Apple Developer Program cost. Unsigned local V1-03 QA continues; public distribution still requires signing. The [usability session protocol](v1-usability-session.md) is ready; participant observations remain pending.

## Candidate status

| Field                                        | macOS arm64                | macOS Intel x64           |
| -------------------------------------------- | -------------------------- | ------------------------- |
| Final v1 source/version/package              | Not selected               | Deferred                  |
| Signed artifact identifiers and hashes       | Pending                    | Not required for v1       |
| Accepted upgrade baseline                    | None registered            | None registered; deferred |
| Contract A01–A12 qualification               | Not run on final candidate | Outside v1 scope          |
| Maintainer acceptance / publication approval | Pending / pending          | Not applicable to v1      |

Scope decision, 23 October 2026: the maintainer approved Apple silicon-only v1 because purchasing Intel test hardware is outside the current budget. Intel build checks are paused; native qualification and supported downloads are deferred.

Keep [the baseline register](../upgrade-baselines.md) authoritative for accepted artifacts. Neither local development packages nor green CI automatically become a baseline.

## Current development checks

[24 October workflow baseline](2026-10-24-v1-workflows.md): 20 automated desktop tests passed on source build `db7f1d3c871da448ab3a599a267330728d30c506`, with one packaged-vault test skipped. This is supplementary V1-03 evidence, not participant observation or final-candidate qualification.

[Integrity and unsigned package follow-through](2026-10-24-integrity-and-package.md): 14 PG18 integration tests, 5 source desktop checks, 5 packaged connection/native-vault checks and 2 packaged guarded-save checks passed. Two additional packaged recovery checks passed after adding Unicode/large-number text and durable explicit discard assertions. Native denied-store, complete live-editor interruption coverage, complete coverage mapping and performance budgets remain open. The build configuration now produces arm64 only.

## Existing evidence and limits

| Evidence                                                                                                                                   | What it establishes                                                                                                                                                                                                                                  | What it does not establish                                                                                                                                                                  |
| ------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [23 October macOS installation report](2026-10-23-macos-installation.md), source `3af0c571fa70dc5b66e1fc5ac8e837e6714a1d3a`                | Historical unsigned arm64 package automation plus fresh-account operator reports for connection, reconnect, query/draft recovery, cancellation and JSON save; report distinguishes independently checked package identity from operator observations | Final redesigned UI acceptance, fresh-account JSON recovery, unavailable/denied vault behaviour, Intel acceptance, signed download/Gatekeeper qualification or an accepted release baseline |
| [Release checklist evidence history](../release-checklist.md)                                                                              | Prior automated/native observations and local performance samples with their recorded scope                                                                                                                                                          | A fresh test run, final-candidate qualification or an agreed performance SLA                                                                                                                |
| [CI run 39896355862](https://github.com/adamspicedev/rowberry/actions/runs/39896355862), source `50b0dd83552b7d94db59df8286eb1c25f9fefbd3` | Previously recorded green source checks for the website/scoped-CI branch                                                                                                                                                                             | Native final-release acceptance, publication approval, or proof of desktop-job skipping on a subsequent website-only change                                                                 |

The earlier installation report identifies its exact installer/archive digests. Consult that immutable candidate context before reusing evidence; it is not the current v1 candidate. This inventory does not re-run or re-verify historical checks.

## Open evidence and responsibility

All rows remain open until linked results satisfy the contract. “Pending” means work has not yet supplied the required evidence; “blocked historically” describes the recorded test access limitation, not a newly verified machine state.

| Gap / acceptance tasks                                                                       | Status                                                  | Responsible role                      | Next item and required record                                                                                                      |
| -------------------------------------------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Signing/notarization and arm64 test readiness / A01                                          | Pending                                                 | Release engineering                   | V1-02: protected signing result and native test access; V1-07: actual downloaded signed package results                            |
| Redesigned workspace and uncoached JSON saving / A04, A05, A10                               | Pending                                                 | Product + QA                          | V1-03: package identity, participant task observations, coaching/failures and retest results                                       |
| Denied/unavailable native credential store / A03                                             | Blocked historically: Keychain lock control unavailable | Engineering + QA                      | V1-04: native scenario, exact outcome and persistence checks on macOS arm64; keep blocked if test access is unavailable            |
| JSON recovery and durable discard / A08                                                      | Partial historical coverage                             | Engineering + QA                      | V1-04: interrupted/invalid JSON, Unicode and precise numeric recovery plus discard on known packages                               |
| TLS, conflicts, ambiguous writes, stale operations and transaction lifecycle / A02, A06, A07 | Qualification audit pending                             | Engineering + QA                      | V1-05: existing coverage map, uncovered scenarios, fixes and results; do not assume missing evidence is a confirmed defect         |
| Cancellation and large-workload budgets / A09                                                | Historical samples only                                 | Engineering + QA                      | V1-05: reference hardware, agreed numeric budgets, workloads and measured results                                                  |
| Result export scope                                                                          | Decision pending                                        | Product                               | V1-06: blocked user task or explicit deferral; if included, acceptance criteria and delivered results                              |
| Exact signed preview and retained baseline / A01–A11 as applicable                           | Pending                                                 | Release engineering + QA              | V1-07: durable artifacts, per-target native checks, maintainer acceptance and any bootstrap exception                              |
| Actual preview use and accessibility / A04, A05, A10                                         | Pending                                                 | Product + Engineering + QA            | V1-08: completed task records, resolved blocker queue and targeted retests                                                         |
| Final package upgrades and distribution / A01–A12                                            | Pending                                                 | Release engineering + QA + Maintainer | V1-09: exact-candidate qualification, baseline installer replacement, download/docs verification and explicit publication decision |

## Recording a candidate

Create a dated record under `docs/qa/` for each candidate, using the following fields. Link it here and in the accepted baseline register only when acceptance occurs. Do not store passwords, tokens, connection URLs containing credentials or real user data in evidence.

- Version and full source commit:
- Target OS/version, architecture and reference hardware:
- Tester, date and native session/test-account conditions:
- Durable installer and unpacked application identifiers:
- Installer SHA-256 and app.asar SHA-256:
- Signing/notarization/Gatekeeper results and retained output:
- Baseline record and verified digests, or proposed first-release bootstrap exception:
- Disposable fixture/database versions and performance budgets:
- Applicable CI source revision, run and result:

| Contract task                              | Procedure / automated test / command | Actual outcome | Status  | Evidence link | Remaining finding / owner |
| ------------------------------------------ | ------------------------------------ | -------------- | ------- | ------------- | ------------------------- |
| A01–A12: add one row per task and scenario | Pending                              | Not observed   | Not run | Pending       | Pending                   |

Use **Not run**, **Blocked**, **Fail**, **Partial** or **Pass**. Partial/blocked results do not satisfy a gate. State whether evidence is automated, directly observed or operator-reported. Record inapplicability only with its rationale and explicit scope/bootstrap decision; do not silently skip required work.

- QA recommendation and unresolved blockers:
- Maintainer target acceptance, name/date and any approved bootstrap exception:
- Separate publication approval, name/date:
- Published download hash verification and retained baseline record:
