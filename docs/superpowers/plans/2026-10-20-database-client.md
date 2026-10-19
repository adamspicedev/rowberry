# PostgreSQL Desktop Client Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Deliver a free desktop PostgreSQL client with reliable large-document JSON inspection and editing on macOS, Windows, and Linux.

**Architecture:** Electron main supervises a database utility process, OS credential storage, and a restricted preload bridge. React owns presentation; a worker handles precision-preserving JSON documents. PostgreSQL integration and packaged desktop checks prove behaviour across process boundaries.

**Tech Stack:** Electron, React, TypeScript, Vite, shadcn/ui, Tailwind, Monaco, node-postgres, Zod, SQLite, Vitest, Playwright. Select supported stable versions at implementation time, verify official compatibility, and pin them in the lockfile. Evaluate a maintained lossless JSON parser against the numeric and duplicate-key fixtures before adopting it.

**Spec:** `docs/superpowers/specs/2026-10-20-database-client-design.md`

## Global constraints

- Every shipped feature is available without a paid tier.
- Initially support PostgreSQL 14 through 18.
- First release: macOS Apple Silicon and Intel, Windows x64, Linux x64 AppImage/deb.
- Use Prisma Studio as the visual reference and shadcn/ui with Tailwind for controls and styling.
- Credentials never enter renderer state or plaintext persistence; Linux without Secret Service uses session-only passwords.
- No automatic mutation retries, unbounded query buffering, startup query execution, or telemetry by default.
- No branch name may contain codex.
- Name and license remain undecided. Do not create a public release until chosen.
- Repository starts empty and without Git. Initialize locally on `main` during Task 1; do not create a remote or publish.

## Review focus

1. Late results from an old connection must not overwrite a newly selected connection's state. Task 3 tests session generations.
2. A database restart during save must retain drafts and distinguish failure from an uncertain commit. Task 8 injects disconnects.
3. Composite keys, quoted identifiers, generated columns, and row-level security must not cause incorrect writes. Tasks 4 and 8 use real fixtures.
4. Closing a tab or window with unsaved or invalid JSON must offer recovery without silently losing edits. Tasks 7 and 9 exercise lifecycle events.
5. Unusual JSON keys, duplicate properties, extreme numbers, and stale worker replies must not corrupt documents. Tasks 6 and 7 test these inputs.

## File structure and contracts

- `src/shared/protocol.ts`: Zod request/event schemas and inferred TypeScript types, no Electron imports.
- `src/main/{index,windows,bridge,database-process,credentials,store}.ts`: lifecycle, window policy, sender validation, process supervision, secret access, SQLite migrations.
- `src/preload/index.ts`: expose only `window.dbapp.request`, `subscribe`, and `unsubscribe` using validated messages.
- `src/database/{index,connections,introspection,queries,rows,types}.ts`: driver and SQL operations. Only this process opens database sockets.
- `src/renderer/app/`: shell, tabs, connection switching, theme and recovery.
- `src/renderer/features/{connections,schema,query,table,json}/`: feature UI and state colocated with tests.
- `src/json/{document,paths,search,worker,protocol}.ts`: lossless document model and revisioned worker commands.
- `tests/{integration,e2e,fixtures}/`: PostgreSQL and desktop behaviour; `scripts/` contains fixture and package verification tools.
- `.github/workflows/{checks,packages}.yml`, `electron-builder.yml`: platform verification and packaging.

Shared IDs are opaque strings: ConnectionId, SessionId, RequestId, DocumentId. Every request carries requestId; session operations carry sessionId and a generation counter. Errors use `{code,message,retryable,outcome:'failed'|'unknown'}` and contain no credentials.

`request(command: Command): Promise<Reply>` and `subscribe(listener: (event: AppEvent) => void): () => void` are the renderer API. Commands are a discriminated union, never arbitrary method names. Validate both ends and reject stale session generations. Query cells use `{typeOid:number, text:string|null}`; JSON uses raw text. Row targets include quoted-source identifiers as separate strings, original key values, and a concurrency token, never renderer-authored WHERE clauses.

## Task 1: Secure runnable application and platform build

**Files:** Create `package.json`, lockfile, `tsconfig*.json`, `vite.config.ts`, `electron-builder.yml`, `src/main/{index,windows,bridge}.ts`, `src/preload/index.ts`, `src/shared/protocol.ts`, `src/renderer/{index.html,main.tsx,app/App.tsx}`, `tests/e2e/security.spec.ts`, workflows, `.gitignore`, `README.md`, repository `AGENTS.md` containing the user's instructions.

**Interfaces:** Produces the request/subscription API above, initially with `app.info` only. No generic IPC channel exposed. All later tasks extend the union.

- [ ] Initialize Git on main. Configure pinned compatible dependencies and scripts: `dev`, `build`, `typecheck`, `lint`, `test`, `test:integration`, `test:e2e`, `package`, `verify:package`.
- [ ] Add failing Electron tests named `renderer cannot access Node`, `untrusted sender rejected`, and `malformed command rejected`: assert `typeof window.require === 'undefined'`, an untrusted frame cannot invoke bridge operations, and malformed inputs return a validation error without dispatch.
- [ ] Run `pnpm test:e2e tests/e2e/security.spec.ts`; require assertions to fail for the missing bridge/window policy, not an unrelated boot error.
- [ ] Implement a locally loaded, sandboxed, context-isolated window with restrictive CSP, blocked unexpected navigation/new windows, bounded messages, validated sender identity, and typed preload API. Add a minimal shadcn shell with sidebar, tabs, and empty workspace.
- [ ] Run `pnpm typecheck`, `pnpm lint`, `pnpm build`, and the security tests. CI builds/packages on all three OS runners. `verify:package` verifies expected executable/assets/architecture and launches an application smoke check where supported. A local macOS result is not a Windows/Linux pass.
- [ ] Commit the shell, documentation, and approved spec/plan with `feat: establish secure desktop application`.

## Task 2: Persistent connections and secure credentials

**Files:** Create `src/main/{store,credentials}.ts`, `src/renderer/features/connections/{ConnectionDialog,ConnectionList}.tsx`, `tests/integration/store.test.ts`, `tests/e2e/connections.spec.ts`; extend protocol and bridge.

**Interfaces:** `ConnectionProfile = {id,name,host,port,database,user,tls,environmentColor}` with a validated TLS union. `CredentialStore` exposes `get(id):Promise<string|null>`, `set(id,secret):Promise<void>`, `delete(id):Promise<void>`, `available():Promise<boolean>`. Commands `connections.list/save/delete` and `connections.connect` accept passwords only through a dedicated secret submission operation; secret inputs never return in replies/events. UI password input is transient, cleared immediately, and never part of application state or persistence. This is the only renderer credential entry exception; retrieved saved passwords remain outside the renderer.

- [ ] Add failing tests proving migration rollback, metadata-only persistence, redacted errors/logging, deletion of credentials, and session-only behaviour when the OS store is unavailable. Assert a sentinel password is absent from persisted files and responses.
- [ ] Run `pnpm test tests/integration/store.test.ts` and confirm the specific missing behaviour fails.
- [ ] Implement transactional SQLite migrations, profile forms, OS-backed credentials through maintained platform adapters, session-only fallback, TLS choices and explicit insecure-mode explanation. Do not place passwords in connection URLs shown in errors.
- [ ] Run focused tests and `pnpm test:e2e tests/e2e/connections.spec.ts`. Verify save/restart/delete and unavailable-store behaviour; record native store checks per OS separately.
- [ ] Commit with `feat: save connections with secure credentials`.

## Task 3: Direct PostgreSQL sessions

**Files:** Create `src/main/database-process.ts`, `src/database/{index,connections,types}.ts`, `tests/integration/connections.test.ts`, `tests/fixtures/postgres/`, `compose.yaml`; extend protocol.

**Interfaces:** Commands `sessions.open({profileId})`, `sessions.close({sessionId})`. Produces `{sessionId,generation,serverVersion}` and state events `connecting|connected|disconnected`. Database worker receives resolved credentials privately. `openSession(config:ResolvedConnection):Promise<Session>`; Session includes client, generation, and transaction state.

- [ ] Add real PostgreSQL tests for password failure, trusted TLS, rejected untrusted certificate, client certificate auth, connect timeout, process failure cleanup, and an old session reply arriving after connection switching. Assert old generation events cannot update the current workspace.
- [ ] Run `pnpm test:integration tests/integration/connections.test.ts`; verify failures correspond to missing connection behaviour.
- [ ] Implement utility-process lifecycle, node-postgres sessions with explicit parsers, bounded timeouts, cancellation of pending connects, generation filtering, disconnect cleanup and sanitized errors. Preserve raw bigint/numeric/JSON/time values.
- [ ] Run integration tests against PostgreSQL 14 and 18. Run TLS fixtures on the same transport used by the packaged application.
- [ ] Commit with `feat: connect directly to PostgreSQL`.

## Task 4: Schema navigation and bounded table browsing

**Files:** Create `src/database/{introspection,rows}.ts`, `src/renderer/features/schema/SchemaSidebar.tsx`, `src/renderer/features/table/{TableView,table-state}.tsx`, `tests/integration/browse.test.ts`.

**Interfaces:** `schema.list({sessionId}) -> SchemaSnapshot`; `rows.fetch({sessionId,tableId,filter,sort,cursor,pageSize}) -> RowPage`. SchemaSnapshot includes columns, type OIDs, generated/identity flags, PK/unique-key metadata and editability. Filter/sort inputs are typed expressions with bound values. Default 200 rows/page, maximum 1,000; fetch response maximum 16 MiB, with explicit oversized-cell metadata and a separate bounded value fetch operation for JSON inspection.

- [ ] Add failing tests for quoted schema/table/column names, composite keys, views, generated columns, RLS, SQL NULL, empty tables, tables without keys, stable paging and oversized values. Assert browse fetches stay within page and payload limits and never silently truncate editable content.
- [ ] Run `pnpm test:integration tests/integration/browse.test.ts` and confirm missing behaviour failures.
- [ ] Implement catalog introspection and parameterized browsing. Use stable key ordering where available; explain unstable pagination for keyless tables and keep them read-only. Add schema search and virtualized typed grid with loading/error/empty states.
- [ ] Run integration tests and an Electron browse test against populated fixtures. Verify the sidebar and table remain keyboard usable.
- [ ] Commit with `feat: browse PostgreSQL schemas and tables`.

## Task 5: SQL workspace, execution, transactions and cancellation

**Files:** Create `src/database/queries.ts`, `src/renderer/features/query/{QueryWorkspace,query-state}.tsx`, `tests/integration/queries.test.ts`, `tests/e2e/query.spec.ts`.

**Interfaces:** `queries.start({sessionId,sql}) -> {queryId}`, `queries.fetch({queryId,pageSize}) -> ResultPage`, `queries.cancel({queryId})`, `queries.close({queryId})`; events report completion/errors and transaction status. Dedicated execution clients belong to SQL tabs. Results retain OIDs and text values; initial page 200, maximum 1,000 rows and 16 MiB per page.

- [ ] Add failing tests for SELECT, multiple statements, statement errors, BEGIN/ROLLBACK, aborted transactions, cancellation of `pg_sleep`, large results, tab closure, driver failure and unknown mutation outcome. Assert cancellation permits subsequent work and transactions are never silently committed/retried. Select a cursor/protocol strategy that supports bounded SELECT fetching and explicitly reject unsupported batching before execution.
- [ ] Run `pnpm test:integration tests/integration/queries.test.ts` and observe expected failures.
- [ ] Implement dedicated tab sessions, Monaco SQL editor, catalog completion, explicit run/selected-text execution, bounded fetching, accurate duration/status, cancellation and transaction controls. Arbitrary SQL results remain read-only. Saved SQL never auto-executes after restart.
- [ ] Run integration and Electron query tests. Inspect memory while fetching a large generated result and verify bounded retained pages.
- [ ] Commit with `feat: add cancellable SQL workspace`.

## Task 6: Lossless JSON model and background search

**Files:** Create `src/json/{document,paths,search,protocol,worker}.ts`, `src/json/{document,search}.test.ts`, `tests/fixtures/json/`, `scripts/benchmark-json.ts`.

**Interfaces:** `parseDocument(text:string):JsonDocument` retains token/source ranges, duplicate-key diagnostics and numeric lexemes. `applyOperation(doc,operation):JsonDocument` supports set/add/remove/move; paths use JSON Pointer. Worker commands `load/edit/search/cancel/release` carry documentId and revision; replies preserve them. Search returns matching paths and text ranges in bounded batches. Undo/redo stores reversible operations or source edits without coercing numbers.

- [ ] Add failing tests asserting `9007199254740993`, `1e400`, and `-0` survive untouched edits; `/a~1b/~0key` resolves correctly; duplicate keys block structural edits; invalid text remains recoverable; 100-level nesting and Unicode work. Add a stale-revision reply test.
- [ ] Run `pnpm test src/json` and confirm feature-specific failures.
- [ ] Implement the lossless model, pointer escaping, reversible edits, iterative traversal, cancellable search, source ranges, worker revision checks and explicit limits. Maximum editable UTF-8 input is initially 32 MiB; larger values offer a clear limit error and copy/export guidance, never partial save. Indexing must yield to cancellation.
- [ ] Run unit tests and `pnpm exec tsx scripts/benchmark-json.ts` on the 10 MiB/100,000 scalar fixture. Record machine and timings; target search within 2 seconds after indexing, with cancellation verified.
- [ ] Commit with `feat: add lossless JSON editing model`.

## Task 7: JSON inspector and editing UI

**Files:** Create `src/renderer/features/json/{JsonInspector,JsonTree,JsonTextEditor,JsonSearch,JsonChangePreview}.tsx`, `json-state.ts`, `tests/e2e/json.spec.ts`.

**Interfaces:** `JsonInspector({documentId,sourceText,saveTarget?})` consumes Task 6's worker API. Emits a validated draft plus original source/version; saveTarget is absent for arbitrary SQL results. Invalid drafts disable tree mutations and save while keeping text editable.

- [ ] Add failing Electron tests for collapsed-branch search, key/value matching, tree-to-text selection, valid text-to-tree sync, invalid text retention, undo/redo, array reorder, JSON null versus SQL NULL, copied pointer escaping, duplicate-key guidance, stale replies, and closing a dirty inspector. Assert no edit is lost when changing view.
- [ ] Run `pnpm test:e2e tests/e2e/json.spec.ts` and confirm expected behaviour failures.
- [ ] Implement the resizable/expandable panel, virtual flattened tree, typed editors, Monaco diagnostics, search navigation, copy actions, diff preview and explicit save/discard. Clearly mark untargeted query-result drafts as copy-only.
- [ ] Run JSON tests and measure normal expand/select actions on the large fixture, targeting 100 ms. Check keyboard navigation and light/dark/system themes; record any unmet performance requirement.
- [ ] Commit with `feat: inspect and edit nested JSON`.

## Task 8: Guarded row saves and conflict handling

**Files:** Extend `src/database/rows.ts`, protocol, table state and JSON inspector; create `tests/integration/writes.test.ts`, `tests/e2e/save.spec.ts`.

**Interfaces:** `rows.save({sessionId,changes:RowChange[]}) -> SaveResult`. RowChange contains an introspected target ID, original key values, original xmin token and changed column text/null values. Worker resolves identifiers/types from its own catalog, validates editability and wraps the batch in a transaction. Results distinguish committed, conflict, failed, and unknown; committed returns refreshed rows/tokens.

- [ ] Add failing real database tests for two-client conflicts, deletion, composite/changed keys, quoted names, RLS denying an update, generated columns, precise JSON numbers, SQL NULL, atomic batch rollback, and connection loss before/during COMMIT. Assert exactly one intended row changes, zero rows is a conflict, uncertain commits are never automatically retried, and drafts remain available.
- [ ] Run `pnpm test:integration tests/integration/writes.test.ts` and confirm required failures.
- [ ] Implement parameterized, key-and-xmin guarded writes with exactly-one-row checks and atomic rollback. Refresh returned rows after success. Add preview, save/discard and reload/compare conflict UI. Require reload after uncertain outcomes before another save. Do not offer automatic merge/overwrite in v1.
- [ ] Run integration tests on PostgreSQL 14/18 and Electron save/conflict tests. Query the target row independently to verify saved values and unchanged neighbours.
- [ ] Commit with `feat: save edits with concurrency protection`.

## Task 9: Workspace recovery and product polish

**Files:** Create `src/renderer/app/{workspace,recovery,theme}.ts`, recovery dialog and command menu; extend store migrations; create `tests/e2e/recovery.spec.ts`, `docs/data-storage.md`.

**Interfaces:** `workspace.load/save` uses a versioned schema containing layout, tab SQL and optional draft recovery. Excludes credentials and result caches. `settings.recoveryEnabled` controls draft persistence and removes persisted drafts when disabled.

- [ ] Add failing tests for restart restoration without query execution, invalid JSON recovery, close/discard/cancel, corrupted state, failed migration, disk-full save errors, and disabling recovery. Assert a failed persistence operation reports failure without destroying the live draft.
- [ ] Run `pnpm test:e2e tests/e2e/recovery.spec.ts` and confirm expected failures.
- [ ] Implement debounced transactional state persistence, dirty-close handling, explicit recovery choices, saved-query organization, connection identity, system theme, focus management, accessible labels and command shortcuts. Document recovery data sensitivity and file locations.
- [ ] Run focused recovery/accessibility checks and all completed behavioural suites. Manually inspect the actual app against the Prisma Studio visual direction with realistic data.
- [ ] Commit with `feat: restore workspaces and recover drafts`.

## Task 10: Release qualification and distribution

**Files:** Extend workflows, builder config, README; create `docs/{release-checklist,supported-platforms,security}.md`, `scripts/verify-package.ts` and platform smoke tests.

**Interfaces:** Release jobs consume externally configured signing secrets and produce versioned packages/checksums. Publishing is a separate explicit action after acceptance; no remote, signing identity or license is invented.

- [ ] Add package smoke checks for starting the production executable, local renderer loading, worker/Monaco assets, profile persistence, database connection, query cancellation and guarded JSON save. A missing executable, worker asset or enabled renderer Node integration must fail the check.
- [ ] Run these against unsigned development packages and confirm deliberately missing worker assets fail verification.
- [ ] Finish packaging for the specified architectures; verify Electron OS floors from official docs and document them. Add PostgreSQL 14–18 CI coverage, with full core integration coverage on 14/18. Document native credential-store verification and supported Linux desktop requirements.
- [ ] Run `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm test:integration`, `pnpm test:e2e`, `pnpm build`, `pnpm package`, `pnpm verify:package`. Record actual platform results and pending checks separately. Re-run large JSON benchmarks on production builds.
- [ ] Obtain product name, license selection, signing credentials and required platform evidence before release. Verify Windows signatures and macOS notarization, generate checksums and release notes, and complete a fresh-install/upgrade smoke check. Missing signing or OS evidence blocks public release, not local development.
- [ ] Commit with `build: qualify cross-platform desktop releases`. Report local checks, CI, signing, and publication as separate states.

## Self-review decisions

The credential-entry wording clarifies the spec: a user-entered password necessarily exists briefly in the connection form, but retrieved secrets never enter renderer state. Numeric JSON fixtures are acceptance gates for the parser choice. Buffer and document limits are explicit and must be displayed, not silently applied. The milestone order follows the spec's shared process/transport boundaries; external signing and product decisions remain release dependencies. No implementation or public-release claims follow from this plan alone.
