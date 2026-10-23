# V1 to-do list

Execution record for the [v1 roadmap](roadmap-v1.md), started 23 October 2026. IDs are repository tracking labels, not GitHub issues. A checked item means its stated deliverable is complete; it does not imply release approval. Owner names below are responsibility roles, not assignments to external people.

- [x] **V1-01 — Release contract and evidence register** · Maintainer + QA
  - [x] Define scope, observable acceptance tasks and release blockers in the [release contract](v1-release-contract.md).
  - [x] Create the [evidence register](qa/v1-evidence-register.md), separate historical evidence from candidate qualification, and assign each open gap a next task and responsible role.
  - Completed: 23 October 2026. Planning deliverables complete; runtime qualification and publication approval remain pending.
- [ ] **V1-02 — Signing credentials and arm64 test readiness** · Release engineering · Next
  - [ ] Verify protected macOS signing/notarization configuration without exposing secrets; exercise it on a candidate.
  - [ ] Prepare the existing Apple silicon Mac for native qualification; record test-account access, tester and OS coverage.
  - [ ] Record signing or native test-access blockers. Intel qualification is deferred by the 23 October 2026 scope decision.
- [ ] **V1-03 — Observe current JSON save and workspace usability** · Product + QA · Can run alongside V1-02
  - [ ] Select a known package, disposable fixture and three unfamiliar preview participants.
  - [ ] Observe connect, browse, query, edit, save, verify and recovery tasks without coaching; record intervention and failure points.
  - [ ] Identify focused fixes; re-run failed tasks after changes, including keyboard, light/dark and narrow-window checks.
- [ ] **V1-04 — Close vault and JSON recovery evidence gaps** · Engineering + QA · Requires native test access
  - [ ] Exercise saved credentials, deletion and genuinely unavailable/denied native storage on each target.
  - [ ] Verify interrupted JSON recovery, invalid JSON, Unicode, exact large numbers and durable discard.
  - [ ] Retain outcomes tied to package hashes. Keep inaccessible scenarios blocked rather than passed by simulation.
- [ ] **V1-05 — Audit integrity and interruption coverage** · Engineering · Before signed preview acceptance
  - [ ] Map contract tasks A04–A09 to existing regression coverage and identify uncovered cases.
  - [ ] Verify conflicts, stale connection operations, ambiguous writes, cancellation and transaction/tab lifecycle behaviour.
  - [ ] Agree performance budgets on reference hardware, measure bounded large workloads and fix demonstrated blockers.
- [ ] **V1-06 — Decide minimum result-export scope** · Product · After initial V1-03 observations
  - [ ] Record whether a real core task is blocked without export.
  - [ ] Decide explicit deferral or a bounded feature with format, row scope, size, cancellation, fidelity and spreadsheet handling specified.
  - [ ] If included, implement and qualify it before preview acceptance; do not treat the decision alone as delivered functionality.
- [ ] **V1-07 — Signed preview and first accepted baseline** · Release engineering + QA · Depends on V1-02–V1-06 for each distributed target
  - [ ] Retain exact signed/notarized packages and source with digests in durable storage.
  - [ ] Complete downloaded-package, native installation, credential and recovery checks for each distributed architecture.
  - [ ] Record maintainer acceptance and, if applicable, the explicit first-release bootstrap exception; update the baseline register.
- [ ] **V1-08 — Preview feedback and targeted polish** · Product + Engineering · Depends on V1-07
  - [ ] Observe actual task completion, collect reproducible findings and fix release blockers.
  - [ ] Re-test affected workflows and record evidence; silence or elapsed time alone is not acceptance.
- [ ] **V1-09 — Final candidate, upgrades and distribution** · Release engineering + QA · Depends on V1-08
  - [ ] Freeze final source/packages and qualify macOS arm64 against the contract and authoritative release checklist.
  - [ ] Verify real installer upgrades from retained accepted baselines and preserve previous artifacts.
  - [ ] Finish versioned downloads, checksums, source/notices, limitations, manual-update instructions and support/security reporting routes.
  - [ ] Obtain explicit maintainer publication approval, verify published downloads/docs, and register the accepted baselines.

Update this file and the evidence register when work completes. A failed acceptance task reopens the relevant item. Changes to platform or feature scope must be recorded in the release contract before qualification.
