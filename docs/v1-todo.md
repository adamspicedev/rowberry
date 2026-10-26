# V1 to-do list

Execution record for the [v1 roadmap](roadmap-v1.md), started 23 October 2026. IDs are repository tracking labels, not GitHub issues. A checked item means its stated deliverable is complete; it does not imply release approval. Owner names below are responsibility roles, not assignments to external people.

- [x] **V1-01 — Release contract and evidence register** · Maintainer + QA
  - [x] Define scope, observable acceptance tasks and release blockers in the [release contract](v1-release-contract.md).
  - [x] Create the [evidence register](qa/v1-evidence-register.md), separate historical evidence from candidate qualification, and assign each open gap a next task and responsible role.
  - Completed: 23 October 2026. Planning deliverables complete; runtime qualification and publication approval remain pending.
- [ ] **V1-02 — Signing credentials and arm64 test readiness** · Release engineering · Signing deferred
  - [ ] Verify protected macOS signing/notarization configuration without exposing secrets; exercise it on a candidate.
  - [ ] Prepare the existing Apple silicon Mac for native qualification; record test-account access, tester and OS coverage.
  - [ ] Record signing or native test-access blockers. Intel qualification is deferred by the 23 October 2026 scope decision.
  - Signing deferred by the maintainer on 24 October 2026 because Apple Developer Program membership is outside the current budget. Continue unsigned local QA; signing remains required before public distribution.
- [ ] **V1-03 — Observe current JSON save and workspace usability** · Product + QA · In progress
  - [x] Run the [24 October automated workflow baseline](qa/2026-10-24-v1-workflows.md): 20 passed, 1 packaged-vault test skipped.
  - [x] Prepare a [moderated task script and recording template](qa/v1-usability-session.md).
  - [ ] Select a known package, disposable fixture and three unfamiliar preview participants.
  - [ ] Observe connect, browse, query, edit, save, verify and recovery tasks without coaching; record intervention and failure points.
  - [ ] Identify focused fixes; re-run failed tasks after changes, including keyboard, light/dark and narrow-window checks.
- [ ] **V1-04 — Close vault and JSON recovery evidence gaps** · Engineering + QA · In progress; denied-store testing still pending
  - [x] Verify the [unsigned arm64 native Keychain round trip and packaged connection workflows](qa/2026-10-24-integrity-and-package.md).
  - [ ] Exercise saved credentials, deletion and genuinely unavailable/denied native storage on each target.
  - [x] Add packaged regressions for verbatim invalid JSON/Unicode/large-number recovery and explicit recovered-copy discard across restart.
  - [x] Verify interrupted JSON recovery, invalid JSON, Unicode, exact large numbers and durable discard in the [unsigned packaged scenarios](qa/2026-10-24-integrity-mapping.md); final-candidate qualification remains required.
  - [x] Fix retry-after-read-failure draft persistence and preserve displaced SQL as detached copies; verify [abrupt process termination after acknowledged persistence](qa/2026-10-26-recovery-retry.md).
  - [x] Retain completed development outcomes tied to package hashes. Native denied-store access remains explicitly blocked; no simulated result closes that gate.
- [ ] **V1-05 — Audit integrity and interruption coverage** · Engineering · In progress; before signed preview acceptance
  - [x] Run the [PG18 write-integrity and packaged guarded-save baseline](qa/2026-10-24-integrity-and-package.md); fix the stale Intel packaging target.
  - [x] Map contract tasks A04–A09 to [existing regression coverage and remaining gaps](qa/2026-10-24-integrity-mapping.md).
  - [x] Verify development coverage for conflicts, stale connection operations, ambiguous writes, cancellation and transaction/tab lifecycle in the [integrity map](qa/2026-10-24-integrity-mapping.md); requalify the final release candidate separately.
  - [x] Establish working M4 development budgets and qualify bounded large JSON workloads. [Three latest packaged repetitions](qa/json-performance-and-accessibility.md#packaged-follow-up-26-october-2026) passed nine tests, 60 cleanup cycles and 60 large-string selection samples; large-string selection now enforces the 100 ms budget.
  - [x] Qualify a [one-hour repeated JSON cleanup workload](qa/json-performance-and-accessibility.md#one-hour-packaged-result-26-october-2026): 6,365 cycles within retained-resource limits.
  - [x] Add and run [process-memory checks without forced collection](qa/json-performance-and-accessibility.md#packaged-process-memory-result-27-october-2026): six scenarios, 180 cycles, maximum sampled total 1,193.84 MiB within the calibrated 1.5 GiB reference ceiling.
  - [ ] Qualify peak process memory, hours-long typical use and lower-spec supported Macs; the repeated-cleanup scenario does not close these broader items.
- [ ] **V1-06 — Decide minimum result-export scope** · Product · After initial V1-03 observations
  - [ ] Record whether a real core task is blocked without export.
  - [ ] Decide explicit deferral or a bounded feature with format, row scope, size, cancellation, fidelity and spreadsheet handling specified.
  - [ ] If included, implement and qualify it before preview acceptance; do not treat the decision alone as delivered functionality.
- [ ] **V1-07 — Signed preview and first accepted baseline** · Release engineering + QA · Depends on V1-02–V1-06 for each distributed target
  - [ ] Retain exact signed/notarized packages and source with digests in durable storage.
  - [ ] Complete downloaded-package, native installation, credential and recovery checks for each distributed architecture.
  - [ ] Record maintainer acceptance and, if applicable, the explicit first-release bootstrap exception; update the baseline register.
- [ ] **V1-08 — Preview feedback and targeted polish** · Product + Engineering · Depends on V1-07
  - [x] Build the [native VoiceOver harness](qa/native-voiceover-harness.md) and fix automatic JSON expansion/collapse announcements on the recorded unsigned candidate.
  - [x] Fix [notification expiry during overlapping pointer and keyboard interaction](qa/2026-10-27-toast-interaction.md); packaged regression verifies pause, keyboard Undo and resumed dismissal.
  - [ ] Observe actual task completion, collect reproducible findings and fix release blockers.
  - [ ] Re-test affected workflows and record evidence; silence or elapsed time alone is not acceptance.
- [ ] **V1-09 — Final candidate, upgrades and distribution** · Release engineering + QA · Depends on V1-08
  - [ ] Freeze final source/packages and qualify macOS arm64 against the contract and authoritative release checklist.
  - [ ] Verify real installer upgrades from retained accepted baselines and preserve previous artifacts.
  - [ ] Finish versioned downloads, checksums, source/notices, limitations, manual-update instructions and support/security reporting routes.
  - [ ] Obtain explicit maintainer publication approval, verify published downloads/docs, and register the accepted baselines.

Update this file and the evidence register when work completes. A failed acceptance task reopens the relevant item. Changes to platform or feature scope must be recorded in the release contract before qualification.
