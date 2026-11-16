# V1 evidence register

Started 23 October 2026 for [V1-01](../v1-todo.md). This register separates evidence already recorded from qualification still required by the [release contract](../v1-release-contract.md). It is a planning inventory, not a new test run.

The signing budget blocker was resolved on 16 November 2026. Developer ID signatures and Apple notarization have passed for local arm64 candidates; see [signed 0.1.3 qualification](2026-11-16-signed-013-qualification.md). Protected GitHub signing secrets, final-release acceptance and public distribution remain separate work. The [usability session protocol](v1-usability-session.md) is ready; unfamiliar participants are not yet available, so those observations and the dependent export decision remain pending.

## Candidate status

| Field                                        | macOS arm64                                                                                                      | macOS Intel x64           |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------- |
| Final v1 source/version/package              | Not selected                                                                                                     | Deferred                  |
| Signed artifact identifiers and hashes       | [Local 0.1.7 candidate](2026-11-16-connection-delete-keyboard.md#candidate-qualification); final v1 not selected | Not required for v1       |
| Accepted upgrade baseline                    | None registered                                                                                                  | None registered; deferred |
| Contract A01–A12 qualification               | Not run on final candidate                                                                                       | Outside v1 scope          |
| Maintainer acceptance / publication approval | Pending / pending                                                                                                | Not applicable to v1      |

Scope decision, 23 October 2026: the maintainer approved Apple silicon-only v1 because purchasing Intel test hardware is outside the current budget. Intel build checks are paused; native qualification and supported downloads are deferred.

Keep [the baseline register](../upgrade-baselines.md) authoritative for accepted artifacts. Neither local development packages nor green CI automatically become a baseline.

The [0.1.7 candidate](2026-11-16-connection-delete-keyboard.md#candidate-qualification) is the latest with completed local app and installer verification. Its recorded 28-test package pass applies to the unchanged application in the verified installer; notarization did not trigger a new suite run. Historical 0.1.6 evidence remains below, and no accepted release baseline is registered.

## Current development checks

[16 November recovery re-enable](2026-11-16-recovery-toggle.md): signed 0.1.7 reproduced empty stored SQL/drafts after toggling recovery off/on. The 0.1.8 repair passed real-editor crash/restart checks on PostgreSQL 14 and 18, including inactive editors, exact invalid JSON, staged/unfinished cell work and non-resurrection of discarded peers. Signed 0.1.8 qualification is recorded separately in the report.

[16 November signed 0.1.3 qualification](2026-11-16-signed-013-qualification.md): signed app and DMG verification, production package workflows and native-vault upgrade/restart evidence are now recorded together. Local storage is not a durable release baseline; unavailable-store and unfamiliar-user acceptance remain open.

[16 November native Keychain denial](2026-11-16-native-keychain-denial.md): the operator denied a real credential-read prompt, then allowed retry. The signed candidate stayed disconnected after denial, retained metadata/query/drafts, reconnected with the retained credential and passed both subsequent launches. Cleanup succeeded; this is partial A03 evidence.

[16 November native denied password save](2026-11-16-native-keychain-save-denial.md): the operator denied storage on signed 0.1.4. The app cleared the input, showed the session-only warning, retained saved work and authenticated for the current process. Both later launches forgot the transient password and did not reuse the still-valid old native credential. Native cleanup succeeded. Locked/unavailable storage and denied deletion remain unqualified.

[16 November session-only warning](2026-11-16-session-password-warning.md): fixed the lost password-storage notice after Connect. Controlled unavailable-store and rejected-write cases verify a persistent warning, usable verified-TLS session and forgetting the password after restart. These regressions do not substitute for actual native denied writes.

[24 October workflow baseline](2026-10-24-v1-workflows.md): 20 automated desktop tests passed on source build `db7f1d3c871da448ab3a599a267330728d30c506`, with one packaged-vault test skipped. This is supplementary V1-03 evidence, not participant observation or final-candidate qualification.

[Integrity and unsigned package follow-through](2026-10-24-integrity-and-package.md): 14 PG18 integration tests, 5 source desktop checks, 5 packaged connection/native-vault checks and 2 packaged guarded-save checks passed. Two additional packaged recovery checks passed after adding Unicode/large-number text and durable explicit discard assertions. Those checks initially left denied-store, live-editor interruption, coverage mapping and performance budgets open; subsequent records below narrow those gaps. The build configuration now produces arm64 only.

[Completed integrity coverage map](2026-10-24-integrity-mapping.md): 64 integration checks passed across PG14/18, all five session scenarios passed with matching fixture certificates, and the complete unsigned package suite passed all 25 tests including native available-store access. Runtime, human and signing limits are recorded separately.

[26 October recovery retry and process termination](2026-10-26-recovery-retry.md): fixed unsaved merged drafts and displaced stored SQL after recovery-read failures. Five renderer regression cases and two packaged recovery scenarios passed. The packaged test now kills its isolated main process after an acknowledged save and verifies exact detached recovery and durable discard. This does not establish recovery before acknowledgement or after machine power loss.

[26 October performance follow-up](json-performance-and-accessibility.md#packaged-follow-up-26-october-2026): nine packaged checks across three repetitions passed, retaining 60 measured cleanup cycles and 60 selections of a 10 MB scalar. Memory/DOM and local interaction budgets passed; peak process memory, hours-long use and lower-spec hardware remain open.

[26–27 October sustained and process-memory checks](json-performance-and-accessibility.md#sustained-cleanup-qualification): the one-hour forced-collection cleanup scenario passed 6,365 cycles. Separately, six short scenarios without forced collection passed 180 cycles with a maximum sampled combined working set of 1,193.84 MiB against the calibrated 1.5 GiB ceiling. Initial calibration failures are retained. These results do not establish exact transient peaks, hours of typical use or lower-spec performance.

[16 November signed 0.1.4 performance refresh](json-performance-and-accessibility.md#signed-014-refresh-16-november-2026): all six bounded scenarios passed with 180 cleanup cycles, 366 process snapshots and 60 large-scalar selections. Maximum sampled working set was 1,175.72 MiB; expansion and selection stayed below 100 ms. All measurements are retained. Exact peaks, longer typical use and lower-spec hardware remain unqualified.

[Native VoiceOver qualification](native-voiceover-harness.md#automatic-announcement-fix-26-october-2026): six automatic-speech checks passed on the recorded October candidate after fixing expansion/collapse announcements. It also verifies scalar naming, modal focus and passed-through Escape; this historical run does not qualify later packages.

[16 November signed 0.1.4 native run](2026-11-16-signed-voiceover.md): nine fresh-speech steps passed, including first/last and offscreen navigation in a 100,000-item array. **Native Home failed**, moving focus to Resize JSON panel; the run stopped before preview/cancellation. Small-tree, browser-input and VoiceOver-off controls narrow the reproduction but do not establish its cause. The physical-keyboard attempt was inconclusive. Native Home, a complete candidate speech run and broader human usability remain open.

[Additional input-path controls](2026-11-16-signed-voiceover.md#input-path-controls-with-voiceover-off): native and browser Home passed all six cases with VoiceOver off, including application screen-reader mode. Native input reached Electron's input hook while browser input bypassed it. The harness now retains bounded event/focus traces and checks final UI state after speech; these controls and harness regressions do not close the live VoiceOver failure.

[JSON discard keyboard repair and signed 0.1.5 qualification](2026-11-16-json-discard-keyboard.md): reproduced missing initial focus on signed 0.1.4 and verified both discard entry points, keyboard containment, safe cancellation, focus restoration and exact invalid-draft preservation. All 27 signed-package tests passed with no skips; app/DMG notarization, Gatekeeper and embedded branding assets were verified. This is separate from native screen-reader, fresh-account installation and final-release qualification.

[Unfinished-result confirmation keyboard repair and signed 0.1.6 qualification](2026-11-16-query-confirmation-keyboard.md): reproduced missing safe focus on signed 0.1.5, then reproduced lost focus after an actual disposable query backend termination on the 0.1.6 development build. Source query and JSON workflows passed on PostgreSQL 14 and 18 after repair. Coverage includes both confirmation entry points, cancellation preserving SQL and results, controlled delayed/failed replies, explicit execution after ending a result, and focus on **Reopen session** after connection loss. The exact signed candidate passed all 27 packaged tests with no skips in 1.6 minutes. App/DMG signing, notarization, stapling and Gatekeeper passed; a read-only mount verified branding assets and the exact tested application archive. This does not establish live VoiceOver, fresh-account installation or final-release acceptance.

[Connection-deletion keyboard and race repair](2026-11-16-connection-delete-keyboard.md#candidate-qualification): reproduced missing cancellation focus and a late deletion reply closing a different connection's unsaved editor on signed 0.1.6. The 0.1.7 repair keeps pending deletion modal, restores usable focus, and retains failure feedback in the confirmation. Source checks, independent review and light/dark inspection passed. The recorded package run passed all 28 tests with no skips in 1.6 minutes. App/DMG signing, notarization, stapling and Gatekeeper passed; a read-only mount verified the branded background, icon, Finder reference, Applications link and unchanged tested application archive. These results do not qualify native denied credential deletion, live VoiceOver, fresh-account installation or final-release acceptance.

## Existing evidence and limits

| Evidence                                                                                                                                   | What it establishes                                                                                                                                                                                                                                  | What it does not establish                                                                                                                                                                  |
| ------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [23 October macOS installation report](2026-10-23-macos-installation.md), source `3af0c571fa70dc5b66e1fc5ac8e837e6714a1d3a`                | Historical unsigned arm64 package automation plus fresh-account operator reports for connection, reconnect, query/draft recovery, cancellation and JSON save; report distinguishes independently checked package identity from operator observations | Final redesigned UI acceptance, fresh-account JSON recovery, unavailable/denied vault behaviour, Intel acceptance, signed download/Gatekeeper qualification or an accepted release baseline |
| [Release checklist evidence history](../release-checklist.md)                                                                              | Prior automated/native observations and local performance samples with their recorded scope                                                                                                                                                          | A fresh test run, final-candidate qualification or an agreed performance SLA                                                                                                                |
| [CI run 39896355862](https://github.com/adamspicedev/rowberry/actions/runs/39896355862), source `50b0dd83552b7d94db59df8286eb1c25f9fefbd3` | Previously recorded green source checks for the website/scoped-CI branch                                                                                                                                                                             | Native final-release acceptance, publication approval, or proof of desktop-job skipping on a subsequent website-only change                                                                 |

The earlier installation report identifies its exact installer/archive digests. Consult that immutable candidate context before reusing evidence; it is not the current v1 candidate. This inventory does not re-run or re-verify historical checks.

## Open evidence and responsibility

All rows remain open until linked results satisfy the contract. “Pending” means work has not yet supplied the required evidence; “blocked historically” describes the recorded test access limitation, not a newly verified machine state.

| Gap / acceptance tasks                                                                       | Status                                                               | Responsible role                      | Next item and required record                                                                                                      |
| -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Signing/notarization and arm64 test readiness / A01                                          | Local signed candidate passed; broader OS/test-account coverage open | Release engineering                   | V1-02: minimum-OS and disposable-account qualification, remote signing if used; V1-07: downloaded retained candidate               |
| Redesigned workspace and uncoached JSON saving / A04, A05, A10                               | Awaiting unfamiliar participants                                     | Product + QA                          | V1-03: package identity, participant task observations, coaching/failures and retest results                                       |
| Denied/unavailable native credential store / A03                                             | Real denied-read/retry and denied-save fallback passed               | Engineering + QA                      | V1-04: locked/unavailable storage and native denied deletion; final-candidate requalification                                      |
| JSON recovery and durable discard / A08                                                      | Development restart/crash checks passed                              | Engineering + QA                      | V1-04: interrupted/invalid JSON, Unicode and precise numeric recovery plus discard on known packages                               |
| TLS, conflicts, ambiguous writes, stale operations and transaction lifecycle / A02, A06, A07 | Development coverage mapped and exercised                            | Engineering + QA                      | V1-05: requalify the final candidate; retain controlled-failure limits                                                             |
| Cancellation and large-workload budgets / A09                                                | Recorded local budgets and repeated checks                           | Engineering + QA                      | V1-05: peak process memory, hours-long sessions and lower-spec hardware; retain local budget evidence                              |
| Result export scope                                                                          | Awaiting participant task evidence                                   | Product                               | V1-06: blocked user task or explicit deferral; if included, acceptance criteria and delivered results                              |
| Exact signed preview and retained baseline / A01–A11 as applicable                           | Pending                                                              | Release engineering + QA              | V1-07: durable artifacts, per-target native checks, maintainer acceptance and any bootstrap exception                              |
| Actual preview use and accessibility / A04, A05, A10                                         | Pending                                                              | Product + Engineering + QA            | V1-08: completed task records, resolved blocker queue and targeted retests                                                         |
| Final package upgrades and distribution / A01–A12                                            | Pending                                                              | Release engineering + QA + Maintainer | V1-09: exact-candidate qualification, baseline installer replacement, download/docs verification and explicit publication decision |

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
