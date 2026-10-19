# Rowberry PostgreSQL desktop client

## Product intent

Build a free, open source database desktop product for macOS, Windows, and Linux. Every shipped feature is available without a paid tier. Full Beekeeper Studio paid-feature parity is the long-term ambition, not the first-release acceptance criterion.

The first release replaces the user's daily PostgreSQL workflow, with particular attention to inspecting, searching, and editing large nested JSON documents. Release quality requires working database operations and verified packaged applications, not a visual prototype.

## First-release scope

- Saved direct PostgreSQL connections, password authentication, and configurable TLS with certificate verification and optional client certificates.
- Schema and table navigation, column/type/key metadata, table filtering, sorting, and paginated browsing.
- SQL tabs with syntax highlighting, schema-aware completion, execution, errors, cancellation, and bounded result fetching.
- Editable table records and JSON fields, with explicit save/discard, validation, preview, and concurrent-change detection.
- Local saved queries and workspace restoration.
- Installable packages and automated checks on all three operating systems.

SSH tunnels, other database engines, AI, shared cloud workspaces, import/export, backup/restore, and cloud identity authentication belong to later milestones. Design database boundaries to permit future adapters without implementing speculative engines now. Licensing is still a product decision; GPLv3 has been proposed but not yet explicitly selected.

## Interface

Use Prisma Studio as the visual reference and shadcn/ui with Tailwind for controls and styling. Prefer neutral surfaces, subtle borders, compact tabs and toolbars, clear typography, restrained colour, and high information density. Support light, dark, and system appearance, keyboard navigation, visible focus, and accessible contrast.

The shell contains a searchable connection/schema sidebar, central tabs for tables and SQL, and a resizable JSON inspector on the right. The inspector can expand to use the workspace for larger documents. Preserve panel sizes locally. Show connection identity and environment colour in the workspace so users can distinguish databases.

The table grid supports virtual rows, bounded pages, typed cell display, selection, filtering, and sorting. Indicate pending edits clearly. Keep Save and Discard discoverable. Errors retain the user's draft and provide an actionable message.

## JSON workflow

The tree and formatted text editor operate on one document draft. Selecting a tree node reveals its text location. Valid text edits update the tree; invalid text remains in the editor with diagnostics and disables saving and tree mutations until corrected. Switching views must never discard text.

- Expand/collapse nested objects and arrays without rendering the complete tree.
- Search both keys and scalar values, navigate results, reveal matching branches, and display an unambiguous path. Search includes collapsed content and supports cancellation.
- Copy paths and nested values. Use JSON Pointer as the canonical escaped path representation.
- Edit typed scalar values, add/remove object properties, and insert/remove/reorder array elements. Distinguish JSON null from SQL NULL.
- Support undo/redo across draft operations, validation, and a before/after preview before saving.
- Preserve numeric lexemes and precision through parsing, editing, transport, and saving. Never convert arbitrary JSON numbers through JavaScript Number. PostgreSQL jsonb may normalize representation; do not promise formatting preservation for jsonb.
- Preserve untouched content for json where possible. Detect duplicate object keys and disable structural editing until the user resolves them, rather than silently removing data.

Parsing, indexing, and search run in a worker with iterative traversal and cancellation. Rendering uses a flattened visible-node model. Large input has explicit limits and progress; the app must explain when a document exceeds supported editing limits instead of freezing or truncating it silently.

Initial acceptance fixtures include a 10 MiB document, 100,000 searchable scalar values, a 100-level nesting fixture, escaped keys, duplicate keys, Unicode, and integers beyond JavaScript's safe range. On a documented reference machine, normal expand/select interactions target 100 ms and completed searches target 2 seconds after indexing. Measure and publish actual results before release; these targets are not verified claims.

## Runtime architecture

Use Bun for package management and scripts, Oxlint for linting, and Oxfmt for formatting. Use Electron, React, TypeScript, and Monaco for SQL and JSON text editing.

1. The sandboxed renderer owns presentation and drafts, with Node integration disabled and context isolation enabled.
2. A narrow preload bridge exposes explicit, validated operations. The main process validates the calling window and owns application lifecycle, OS credential access, and worker supervision.
3. A separate database process owns PostgreSQL sessions and executes database requests. Credentials reach this process only when needed and never enter renderer state.
4. A renderer worker owns precision-preserving JSON parsing, search, and structural transformations.

Use typed request/response messages with runtime validation, request identifiers, cancellation, bounded payloads, and sanitized errors. Never expose arbitrary filesystem, shell, or IPC access to the renderer. Apply a restrictive content security policy and load application code locally. Treat database strings as text, never executable HTML.

## Database correctness

Use a mature PostgreSQL driver with explicit type parsers. Fetch JSON and precision-sensitive types as text. Preserve bigint, numeric, timestamps, binary data, arrays, and SQL NULL without lossy implicit conversions. Bind values as parameters and quote introspected identifiers correctly.

Keep SQL execution on a dedicated connection per active SQL session. Track transaction state, including aborted transactions. Cancellation must target the actual running PostgreSQL request, with cleanup and reconnection when required. Bound query result buffering; offer continued fetching instead of retaining unlimited results. Never automatically retry mutations after uncertain outcomes.

Table and JSON writes require a stable primary or suitable unique key. Tables without a safe row identity remain read-only in the first release. Arbitrary SQL result sets remain read-only; users can edit JSON results as a local draft and copy them, but saving requires a verified table/column/row target.

Capture row identity and a concurrency token when loading an editable row. Use PostgreSQL row-version information with original identity in a guarded update, and require exactly one updated row. Zero rows means the row changed or disappeared; retain the draft and offer reload/compare. More than one row is an error that rolls back. JSON saves update only the selected column. Commit a table edit batch atomically and preserve drafts on failure. Preview pending values before execution and report success only after commit acknowledgement. If a connection drops during commit, report an unknown outcome and require refreshing before another save.

## Local storage and security

Store non-secret connection metadata, saved queries, preferences, and versioned workspace state in local SQLite with transactional migrations. Never persist credentials in this database, application logs, query history, or crash reports.

Use macOS Keychain, Windows Credential Manager, and Linux Secret Service for persisted credentials. If secure storage is unavailable, allow a session-only password and explain why persistence is unavailable. Do not silently fall back to plaintext. Remove the credential when the user deletes its saved connection.

Offer verified TLS as the default remote connection mode. Any unencrypted connection or disabled certificate verification must be an explicit per-connection choice with a clear explanation. Never bypass certificate errors automatically. Use connection and statement timeouts and clean up sessions on disconnect or worker failure.

Restore saved SQL text and layout, but do not execute queries on startup. Keep unsaved drafts locally with explicit recovery/discard controls; drafts may contain sensitive data, so document their location and provide a setting to disable recovery persistence. No telemetry or external data transmission by default.

## Verification and release

Test the distinct correctness boundaries rather than mirroring components:

- Precision-preserving JSON edits, synchronization, undo/redo, duplicate keys, escaped paths, validation, search, deep nesting, and large-input cancellation.
- Real PostgreSQL integration tests for row identity, SQL NULL versus JSON null, concurrent edits, atomic rollback, TLS, permissions, cancellation, transaction errors, and dropped connections.
- End-to-end connection, browsing, query, JSON edit/preview/save, conflict, and restart recovery flows.
- Automated build and packaged smoke tests on macOS, Windows, and Linux. Verify secure credential storage on each supported desktop environment.

Initially support PostgreSQL 14 through 18 and test the oldest and newest versions plus representative intermediate coverage. Pin dependency versions and maintain a reproducible lockfile. Inspect packaged assets and ensure production builds keep renderer isolation enabled.

For initial distribution, target macOS Apple Silicon and Intel, Windows x64, and Linux x64 AppImage/deb. Linux credential persistence requires an available Secret Service. Document supported OS minimums after checking the selected Electron release. Public release requires signed Windows packages and signed/notarized macOS packages, with credentials supplied through release secrets. Signing accounts and Linux desktop coverage are external release dependencies, not grounds for claiming unverified support. Automatic updates are deferred; publish versioned releases with checksums and manual upgrade instructions.

## Delivery sequence

1. Establish the secure desktop shell, bridge, local storage, and three-platform packaging checks.
2. Implement direct PostgreSQL connections, introspection, cancellable SQL, and bounded table browsing.
3. Implement the precision-preserving JSON document model and inspector, including worker performance checks.
4. Add guarded table/JSON saves, previews, conflicts, and recovery.
5. Complete accessibility, platform verification, signing, documentation, and release acceptance.

Each milestone must exercise working behaviour. A completed local build is not evidence of a successful cross-platform release. The approved public display name is Rowberry. Licensing must be selected before public distribution. Keep internal dbapp identifiers stable.

## Branding appendix, 20 October 2026

Approved name: Rowberry, with lowercase `rowberry` rounded wordmark. Tagline: Your databases. In a good place. Verified artwork is `/Users/spicey/Documents/Codex/2026-10-20/task/rowberry-artwork/exec-882a3ffc-0a34-4809-9662-a9a7a8b76a2b.png` (1536 × 1024). Its actual pixels were inspected before deriving clean SVG masters.

The berry uses rounded table cells in rows of 3, 3, 2, 1 with a mint cursor/leaf. Palette: charcoal #191B24, lavender #9B7BFA, mint #72D6B0, warm offwhite #F7F5F0. Light primary controls use darker purple with white; dark primary controls use lavender with charcoal. Preserve the existing data-centred workspace. Concept-board illustration content does not define new features.

Branding milestone: source SVG mark, actual lowercase text wordmark in locally bundled Baloo 2 at weight 800, favicon, PNG/ICO/ICNS packaging assets, public display labels, and accessible light/dark shell. Internal app ID, IPC, credential service, and saved profile location remain stable. Asset provenance and verification evidence are recorded in the branding report. Licensing remains pending; no domain, trademark, or publishing claims.
