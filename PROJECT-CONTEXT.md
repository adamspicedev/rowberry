# Project context

## Name and purpose

Rowberry is a local PostgreSQL desktop workspace for saved connections, schema and table browsing, SQL queries, and guarded table and JSON editing.

## Technology

Electron, React, TypeScript, Monaco Editor, and PostgreSQL drivers; Bun 1.4.2 for development tooling. Local SQLite stores workspace data, and native operating system credential stores hold remembered passwords. Vitest and Playwright cover unit, integration, and desktop behaviour.

## Current phase

Early 0.1.x development with locally signed and notarized Apple-silicon candidates. macOS arm64 is the only v1 release target; Intel Macs, Windows and Linux are deferred. Public distribution remains subject to the remaining installation, usability and release checks. See the [v1 to-do list](docs/v1-todo.md) for current evidence and open work.

## Key constraints

Local assets and workspace storage; no Rowberry hosted service, telemetry, or automatic updater. A sandboxed renderer communicates through validated contracts with privileged processes. PostgreSQL is the only supported database engine. Stable row identity and conflict checking govern edits. Unknown database mutation outcomes are not retried automatically. The project license is GPL-3.0-only.

## Definition of done

A focused change has appropriate behavioural evidence, passing applicable checks, matching documentation, and clear disclosure of unverified environments. Release readiness additionally requires the recorded evidence in the [release checklist](docs/release-checklist.md). The [contributing guide](CONTRIBUTING.md) defines the development workflow.
