# Project status

Rowberry is an early **0.1.x** project, licensed under **GPL-3.0-only**. Public distribution is not yet qualified. The current supported way to evaluate it is to [run from source](getting-started.md). See the [0.1.7 candidate notes](https://github.com/adamspicedev/rowberry/blob/main/docs/release-notes-0.1.7.md) for the latest connection-deletion repair.

The [0.1.7 connection-deletion checks](https://github.com/adamspicedev/rowberry/blob/main/docs/qa/2026-11-16-connection-delete-keyboard.md) cover focus return, cancellation, pending requests and failure recovery. Deletion stays modal until its request settles, preventing a late reply from closing another connection's unsaved editor. The app signature is valid and all 28 packaged tests passed with no skips. Installer verification is pending; 0.1.6 remains the latest candidate with completed app and installer checks.

## Current scope

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

Native VoiceOver testing still has an unresolved Home-key focus issue in the JSON tree. Recorded automated keyboard and partial speech checks do not establish complete accessibility qualification. Unfamiliar-user task testing is also pending.

See the [roadmap to v1](roadmap.md) for milestones and deferred features.

## Help shape the project

[Read the contribution guide](https://github.com/adamspicedev/rowberry/blob/main/CONTRIBUTING.md), report a focused issue, or improve a guide. No dates are promised for future platforms or features.
