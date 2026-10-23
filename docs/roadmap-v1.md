# Rowberry roadmap to v1

Product and release roadmap · 23 October 2026

**Recommendation:** ship a dependable, free macOS PostgreSQL workspace with excellent JSON workflows. Reach v1 through a signed preview, observed everyday use, and qualification of the exact release artifacts. Do not turn v1 into feature parity with a mature database administration tool.

Execution is tracked in the [v1 to-do list](v1-todo.md), with the [release contract](v1-release-contract.md) and [evidence register](qa/v1-evidence-register.md) established by V1-01. This plan is not a release commitment or a claim that the gates below have passed. Milestones are ordered by dependency rather than speculative dates. The [release checklist](release-checklist.md) remains the authoritative publication gate.

## What v1 means

A PostgreSQL user can install Rowberry, connect securely, find and inspect data, run a query, edit eligible table/JSON values deliberately, recover interrupted work, and install a newer version without losing their workspace. The application makes pending changes, saved changes, conflicts and unknown outcomes distinguishable without coaching.

The v1 release scope is **macOS Apple silicon (arm64) only**. Intel Macs, Windows and Linux remain later work. PostgreSQL is the only database engine. Rowberry stays GPL-3.0-only, local-first, and free, without a required account or hosted database service.

Scope decision, 23 October 2026: the maintainer accepted an Apple silicon-only v1 because native Intel hardware is not currently available within budget. Intel build checks are paused; Intel downloads are not supported or part of v1 qualification.

## Council decision

ECC Council was used to choose release scope and tradeoffs. The roadmap translates that decision into work; the council did not perform a new code or security audit.

| Voice      | Position and reasoning                                                                                                                                                                                                                                                                            |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Architect  | Finish a narrow macOS/PostgreSQL/JSON product. Existing capabilities already cover the central workflow; stronger recovery and distribution evidence improves trust; limiting platforms keeps qualification tractable. Main risk: a technically qualified app can still fail ordinary user tasks. |
| Skeptic    | V1 may need almost no new features after a signed preview. Validate saving without coaching and test whether result export is necessary before deferring it. Narrow product positioning must match the actual limits.                                                                             |
| Pragmatist | Freeze expansion, run an invited preview, fix observed task failures, then qualify the final packages. A clear manual update route is sufficient; an automatic updater is not essential.                                                                                                          |
| Critic     | Data integrity and exact-artifact evidence are launch blockers. Audit stale connections, conflicts, ambiguous writes, recovery and native credentials; CI coverage cannot substitute for those results.                                                                                           |

**Consensus:** usability, data safety, recovery and distribution come before feature breadth.

**Strongest dissent:** all three outside voices accept an explicitly Apple Silicon-only launch if Intel qualification delays release. The maintainer subsequently accepted that narrower scope; native Intel qualification is deferred.

**Premise check:** “v1” should mean a reliable, complete job for a defined user, not a long list of database-client features.

**Change prompted by the council:** introduce an early result-export decision gate instead of assuming export belongs after v1. Export is a candidate scope addition, not an approved implementation task.

## Starting point

Repository and evidence review, not a new packaged acceptance run:

| Area         | Present                                                                                                           | Still to establish                                                                                              |
| ------------ | ----------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Connections  | Saved profiles, TLS verification, native credential-store integration and session-only fallback                   | Real denied/locked-store behaviour and native acceptance on every advertised architecture                       |
| Workspace    | Table/query tabs, schema tree, table filtering/sorting, context menus, query completion and saved queries         | Uncoached task completion after the recent redesign; keyboard and accessibility review of the desktop workflows |
| Editing      | JSON tree/search/text, exact numeric/text handling, stable-identity saves and optimistic conflict checks          | Final candidate regression evidence, interruption/recovery scenarios and clear save-state communication         |
| Distribution | Package builds, verification scripts and partial unsigned arm64 lifecycle evidence                                | Signed/notarized downloads, exact-artifact native acceptance, retained baselines and release sign-off           |
| Website/docs | Live marketing site and MkDocs guides                                                                             | Release-specific downloads, supported-version statements and update/support instructions at publication         |
| CI           | Scoped website/desktop checks and a required aggregate gate in PR #7; the gate is configured in branch protection | Merge the workflow change and verify a subsequent website-only PR skips desktop jobs                            |

The [23 October installation report](qa/2026-10-23-macos-installation.md) records successful operator-reported core workflows in a fresh account, but also a JSON save discoverability problem. That report predates later interface changes: repeat the task on the new candidate rather than treating the old failure as a confirmed current bug or the redesign as a verified fix. Locked-Keychain testing was blocked on that host; it did not pass.

There is no accepted release baseline. See [baseline policy](upgrade-baselines.md). The GitHub issue list was empty at this review; the work items below are proposed backlog entries, not existing issues.

## Milestones and exit gates

### M0 — Agree the release contract and unblock qualification

**Owner roles:** maintainer/product, release engineering. **Dependencies:** none. Start immediately; signing and arm64 qualification can progress alongside M1.

- Merge the website/scoped-CI work after review, then verify website-only and desktop-only job selection in ordinary PRs.
- Record the v1 workflow checklist, advertised architectures, supported macOS versions and precise PostgreSQL test coverage. Do not equate connection compatibility on 15–17 with full feature coverage on those versions.
- Confirm access to Apple signing/notarization credentials through the protected release environment and the available Apple silicon desktop test host. Never put credentials in issues, docs or repository files.
- Identify preview participants and a disposable PostgreSQL dataset with nested JSON, large numbers, nulls and a second client for conflict tests.
- Create a release evidence register linking version, commit, final artifact digests, test environment and outstanding failures.

**Exit:** scope and owners are recorded, qualification resources are available or explicitly blocked, and the acceptance tasks are reproducible. A missing signing identity or native test access is visible here, not discovered at launch.

### M1 — Make the everyday workflow complete and obvious

**Owner roles:** product/design and desktop engineering; QA observes. **Dependencies:** acceptance tasks from M0.

Observe these tasks on the current packaged app using unfamiliar users, without telling them where controls are:

1. Create/test a connection, connect, quit, reopen and reconnect.
2. Find a schema/table, inspect columns, filter/sort/page rows and return to a previously opened tab.
3. Write, save, reopen and cancel a query; recognise the tab's transaction state.
4. Open nested JSON, find a value, edit an eligible row, understand pending changes, save, and independently verify the stored result.
5. Understand a read-only result or disabled edit, resolve a conflict, and restore or discard a recovery copy.

Fix observed navigation, naming, focus, menu, error and save-feedback failures. Review both light/dark themes, narrow windows, keyboard-only operation and basic VoiceOver navigation. Use the existing design system and shared menu/toast infrastructure; do not schedule another wholesale redesign without task evidence. Critical save/failure state must remain visible when a toast disappears.

**Export decision:** ask preview participants to complete a real task requiring results outside Rowberry. If copying is insufficient or the omission blocks an agreed core task, add a bounded export feature before the preview exit. Define its format, selected/page/all-result scope, size limits, cancellation, NULL/JSON/number fidelity and spreadsheet handling before implementation. Otherwise document the supported copying path and defer export. Import and COPY streaming are separate decisions.

**Proposed exit target:** at least three observed sessions with users other than the implementer. Every participant completes connect → browse/query → JSON edit/save without coaching after fixes; no unresolved ambiguity about whether a write succeeded. This is a practical acceptance sample, not a statistical usability claim. Record task failures and retest affected paths.

### M2 — Prove integrity, recovery and responsiveness

**Owner roles:** desktop engineering and QA. **Dependencies:** stable core flows from M1; can start alongside usability work.

Audit existing coverage first. Reuse passing behavioural tests and add tests only for uncovered risks. These are scenarios to verify, not claims of current defects:

| Scenario                                                   | Required outcome                                                                                                               |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Change connections while a value/draft is open             | Stale work cannot write to another connection or row                                                                           |
| Another client updates or deletes the row                  | Clear conflict/missing-row result; no silent overwrite                                                                         |
| Network loss or interruption during a write                | No automatic retry; unknown outcome is distinct from failure and directs the user to inspect persisted state                   |
| Quit/crash/restart with pending SQL or JSON                | Exact recoverable copies, including invalid text, Unicode and large numbers; nothing silently replayed                         |
| Discard a recovered copy, then restart                     | The explicit discard remains effective                                                                                         |
| Locked, denied or unavailable native vault                 | Clear session-only behaviour, no plaintext fallback, no unexplained hang; retrieval/deletion also verified                     |
| Explicit transactions, cancellation and unfinished results | State belongs to the correct tab; commit/rollback consequences are clear; cancellation is never presented as proof of rollback |
| Large JSON/result sets and long sessions                   | UI remains usable, work can be cancelled, paging/memory are bounded and no precision is lost                                   |

Use the existing approximately 12 MB / 100,000-value JSON fixture as one repeatable workload, alongside small and malformed inputs. Record reference hardware and measure packaged parse, search, cancellation, interaction latency and memory. Agree explicit budgets before performance fixes; keep existing measured results as a baseline, not a cross-machine SLA.

Perform a focused security/dependency review covering Electron support/advisories at release time, IPC boundaries, renderer isolation, credential handling and distributable notices. A website accessibility pass does not establish desktop accessibility.

**Exit:** no unresolved data-loss, wrong-target-write, credential-exposure or misleading-write-outcome failures; covered scenarios pass on the candidate; any performance budget failure in a core workflow is resolved or narrows the advertised capability explicitly.

### M3 — Deliver a signed, usable preview

**Owner roles:** release engineering and QA; maintainer controls signing/publication. **Dependencies:** M1/M2 blockers closed, M0 release resources available.

- Produce versioned, signed and notarized candidates with corresponding source and notices. Hash final signed artifacts, not just unsigned build outputs.
- Test downloaded DMGs, quarantine/Gatekeeper, installation, first launch, native credentials, reconnect and core workflows on every architecture distributed to preview users.
- Validate recovery and installer replacement on real desktops. Use the documented first-release bootstrap exception where no accepted public baseline exists; do not call a development-build replacement a release-to-release upgrade.
- Retain immutable installers, checksums, source identity and acceptance evidence in durable storage. Local `/tmp` files and expiring CI artifacts are not release baselines.
- Provide preview status, known limits, manual install/update/removal instructions and a clear issue-reporting route with redaction guidance.

**Exit:** a tester can obtain and use the exact signed preview package without developer tooling or undocumented security bypasses. Missing qualification excludes that architecture from the preview explicitly. The two-architecture v1 promise remains unchanged unless the maintainer approves a narrower scope.

### M4 — Validate real use and stabilise

**Owner roles:** product/maintainer, QA and desktop engineering. **Dependencies:** M3 preview.

- Invite the initial participants to use Rowberry for their actual PostgreSQL/JSON work, initially on disposable or suitable non-production data.
- Collect reproducible task blockers and voluntary reports; no telemetry is needed. Record environment, artifact version, observed outcome and severity without private data.
- Prioritise data integrity/security first, blocked core tasks second, repeated friction third. Defer isolated feature requests that do not support the release contract.
- Fix findings in focused changes and repeat affected packaged acceptance tests. Expand the participant sample if feedback is too narrow to cover the target workflows.
- Complete the export decision and show unsupported capabilities honestly rather than exposing misleading controls.

**Exit:** the agreed core tasks succeed across the preview participants and supported configurations, with no open release-blocking findings. Absence of reports alone is not a pass; require completed task records. Do not declare an arbitrary elapsed “soak week” sufficient.

### M5 — Qualify and publish v1

**Owner roles:** release engineering, QA, maintainer. **Dependencies:** M4 accepted; every advertised architecture qualified.

- Freeze feature scope and identify the final source revision and final signed packages.
- Run applicable CI and full production smoke against those exact packages; complete the native installation, credential, recovery and upgrade checks in the release checklist.
- After an accepted preview baseline exists, verify and retain it, then test v1 upgrades from it according to baseline policy. Do not replace the old accepted artifact before verifying the new candidate.
- Document supported platforms/database coverage, known limitations, local storage, backup/update/removal behaviour, safe diagnostics and a functioning private vulnerability-reporting route.
- Deliver versioned DMGs, SHA256SUMS, corresponding source/build instructions, GPL and dependency/font notices, and release notes together. Verify the downloaded artifacts against their recorded hashes.
- Update website/docs with actual download links and matching release claims. Manual updates are sufficient for v1; the instructions must work.
- Obtain explicit maintainer publication approval, publish, verify the live downloads/docs, and register accepted baselines. Do not promise support response times the project cannot sustain.

**Exit:** an external user can discover, download, verify, install, use and later update the supported product through the documented path. Required evidence and maintainer sign-off are linked from the versioned release record.

## Backlog to execute first

These IDs are planning labels. They do not refer to created GitHub issues.

| ID    | Priority | Work item                                             | Owner role               | Done when                                                                     |
| ----- | -------- | ----------------------------------------------------- | ------------------------ | ----------------------------------------------------------------------------- |
| V1-01 | P0       | Release contract and evidence register                | Maintainer + QA          | Core tasks, platform scope and evidence fields agreed; gaps assigned          |
| V1-02 | P0       | Signing credentials and arm64 test readiness          | Release engineering      | Protected signing path works and native qualification can be scheduled        |
| V1-03 | P0       | Observe current JSON save/core-workspace usability    | Product + QA             | Uncoached task failures recorded on a known package; focused fixes identified |
| V1-04 | P0       | Close remaining vault and JSON recovery evidence gaps | Engineering + QA         | Native outcomes recorded; unsupported test access stays an explicit blocker   |
| V1-05 | P0       | Integrity/interruption coverage audit                 | Engineering              | M2 matrix mapped to tests/manual evidence; uncovered critical cases addressed |
| V1-06 | P1       | Decide minimum result-export scope                    | Product                  | Real task evidence supports a bounded implementation or explicit deferral     |
| V1-07 | P0       | Signed preview and first accepted baseline            | Release engineering + QA | M3 accepted for each distributed architecture with durable artifacts          |
| V1-08 | P1       | Preview feedback and targeted polish                  | Product + engineering    | M4 task evidence passes and blocker queue is empty                            |
| V1-09 | P0       | Final candidate, upgrades and distribution            | Release engineering + QA | M5 exact-artifact gates and sign-off pass                                     |

Priority denotes release impact, not permission to ignore dependencies. V1-02 should start while V1-03 runs; it must not wait until all UI polish is complete.

## Explicitly outside v1 unless evidence changes the decision

- Intel Mac and Windows/Linux release qualification, and additional database engines.
- ER diagrams, visual schema design, table drop/truncate/rename administration menus.
- Bulk import, COPY streaming and multi-statement script execution.
- Editable arbitrary SQL result sets.
- Automatic updates, accounts, hosted sync, collaboration or telemetry.
- Broad feature-parity work and another speculative interface rewrite.

These are deferred, not rejected permanently. SQL results remain read only and single-statement execution remains an explicit limit. Read-only inspection must not be confused with a globally read-only connection: ordinary SQL still runs with the database role's permissions.

## Working agreement and immediate next action

Start with **V1-01, V1-02 and V1-03**: define the acceptance tasks, arrange signing and arm64 qualification, and observe the redesigned core workflow. Use their findings to select the next implementation change. Do not begin another major feature before that evidence exists.

At each milestone, record what shipped, what was actually tested, what remains blocked and whether the scope decision changed. Re-estimate dates after M1 and after the signed preview; this roadmap makes no calendar commitment without known capacity and release access.

Planning does not authorize publication, create external issues or configure signing credentials. Publication retains the explicit approval gate in the existing release policy.

## References

- [Release checklist](release-checklist.md)
- [Platform scope and native credential procedure](supported-platforms.md)
- [Upgrade baseline policy](upgrade-baselines.md)
- [Upgrade testing](upgrade-testing.md)
- [macOS installation](macos-installation.md)
- [Latest recorded fresh-account acceptance](qa/2026-10-23-macos-installation.md)
- [Website and user docs](https://rowberry.spicey.dev/)
