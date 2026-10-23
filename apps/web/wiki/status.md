# Project status

Rowberry is an early **0.1.0** project, licensed under **GPL-3.0-only**. Public distribution is not yet qualified. The current supported way to evaluate it is to [run from source](getting-started.md).

## Current scope

- PostgreSQL connection profiles and verified TLS.
- Schema navigation, table browsing, and mixed table/query tabs.
- SQL completion, saved queries, cancellation, and explicit transactions.
- JSON inspection, filtering, text preservation, and guarded editing.
- Local draft recovery.

## Platform focus

| Platform                           | Direction                                                   |
| ---------------------------------- | ----------------------------------------------------------- |
| macOS 13+, Apple silicon and Intel | Current desktop priority; release qualification in progress |
| Windows x64                        | Build target; native desktop qualification deferred         |
| Linux x64                          | Build target; native desktop qualification deferred         |

Build targets and CI checks are not equivalent to a signed, tested public release. Signing, installation, and platform checks are tracked in the repository's [release checklist](https://github.com/adamspicedev/rowberry/blob/main/docs/release-checklist.md).

Database testing covers PostgreSQL 14 and 18, with connection and TLS compatibility checks for 15, 16, and 17. This describes the test scope, not a guarantee for every server configuration.

## Current limits

PostgreSQL is the only database engine. SQL results are read only. Multi-statement SQL batches, COPY streaming, import/export, schema-changing context-menu actions, ER diagrams, and automatic updates are not currently available.

## Help shape the project

[Read the contribution guide](https://github.com/adamspicedev/rowberry/blob/main/CONTRIBUTING.md), report a focused issue, or improve a guide. No dates are promised for future platforms or features.
