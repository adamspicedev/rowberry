# Project status

Rowberry is an early **0.1.x** project, licensed under **GPL-3.0-only**. Public distribution is not yet qualified. The current supported way to evaluate it is to [run from source](getting-started.md). See the [0.1.9 candidate notes](https://github.com/adamspicedev/rowberry/blob/main/docs/release-notes-0.1.9.md) for the latest recovery repair.

Turning recovery off and back on now captures open SQL, JSON and table/cell work without requiring another edit. It also clears pending copies after a failed startup read so retrying cannot revive those discarded drafts. [Source and signed-package recovery checks](https://github.com/adamspicedev/rowberry/blob/main/docs/qa/2026-11-16-recovery-toggle.md#candidate-qualification) cover exact drafts, explicit discard and crash/restart without automatic database writes.

All 30 signed 0.1.8 package tests passed with no skips. App and installer signing, notarization, stapling, Gatekeeper and embedded branding checks passed; 0.1.8 is a previously verified local candidate. Earlier connection-deletion and keyboard repairs remain in the [evidence register](https://github.com/adamspicedev/rowberry/blob/main/docs/qa/v1-evidence-register.md).

The [exact candidate and source are retained privately](https://github.com/adamspicedev/rowberry/blob/main/docs/qa/2026-11-16-retained-018.md), with successful download/checksum and native app verification. This is preparation for future upgrade qualification, not an accepted baseline or public download. The downloaded app passed a development-profile compatibility check from 0.1.7, retaining saved work and native credentials across two launches; installer replacement remains unqualified.

## Current scope

Source version 0.1.9 keeps failed-recovery warnings visible when older saves finish later. See the [development notes](https://github.com/adamspicedev/rowberry/blob/main/docs/release-notes-0.1.9.md). Its signed candidate passed all 30 package tests with no skips and app/installer signature, notarization, stapling and Gatekeeper checks. It is the latest locally verified candidate; 0.1.8 remains privately retained.

- PostgreSQL connection profiles and verified TLS.
- Schema navigation, table browsing, and mixed table/query tabs.
- SQL completion, saved queries, cancellation, and explicit transactions.
- JSON inspection, filtering, text preservation, and guarded editing.
- Local draft recovery.

## Platform focus

| Platform                 | Direction                                         |
| ------------------------ | ------------------------------------------------- |
| macOS 13+, Apple silicon | Only v1 release target; qualification in progress |
| macOS Intel              | Deferred; desktop build checks paused             |
| Windows x64              | Deferred; desktop build checks paused             |
| Linux x64                | Deferred; desktop build checks paused             |

Local Apple-silicon signing and notarization have passed for recorded development candidates. Downloaded-package and fresh-account installation acceptance, minimum supported macOS testing and final-release approval remain open. Build targets and CI checks do not establish a qualified public release. See the repository's [release checklist](https://github.com/adamspicedev/rowberry/blob/main/docs/release-checklist.md).

Database testing covers PostgreSQL 14 and 18, with connection and TLS compatibility checks for 15, 16, and 17. This describes the test scope, not a guarantee for every server configuration.

## Current limits

PostgreSQL is the only database engine. SQL results are read only. Multi-statement SQL batches, COPY streaming, import/export, schema-changing context-menu actions, ER diagrams, and automatic updates are not currently available.

With VoiceOver on, Home can move focus from the JSON tree to the panel divider. To reach the root while staying in the tree, press Left Arrow repeatedly. From a leaf it selects the parent. On an expanded parent it first collapses that item, then the next press moves up a level. Recorded automated keyboard and partial speech checks do not establish complete accessibility qualification. Unfamiliar-user task testing is also pending.

See the [roadmap to v1](roadmap.md) for milestones and deferred features.

## Help shape the project

[Read the contribution guide](https://github.com/adamspicedev/rowberry/blob/main/CONTRIBUTING.md), report a focused issue, or improve a guide. No dates are promised for future platforms or features.
