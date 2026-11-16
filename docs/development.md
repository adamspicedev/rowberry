# Development and technical reference

For setup and contribution workflow, start with [Contributing](../CONTRIBUTING.md).

## Package and verify

```sh
bun run package
bun run verify:package release/mac-arm64/Rowberry.app arm64
```

The active package target is an unsigned development DMG for macOS Apple silicon (arm64). Use `bun run package --mac` on the arm64 Mac; outputs are in `release/`. The ordinary package command disables signing. Follow [local macOS signing](local-signing.md) to create a signed candidate instead.

Verification accepts an unpacked application directory or a macOS `.app`, checks the actual executable header and bundled assets, then launches shell and production behavioural checks on the host's architecture. The complete check requires the disposable PostgreSQL fixtures below. A different architecture receives inspection only and is explicitly reported as not launched. Intel, Windows and Linux desktop packages and their build checks are deferred; [future host notes](desktop-qa-hosts.md) are not current v1 requirements.

GitHub Actions scopes website and desktop changes separately. The desktop scope includes macOS source/Electron checks, arm64 package asset and negative checks, PG14/18 integration/workflow checks on Ubuntu with Xvfb, and PG15–17 connection/TLS compatibility checks. Website builds and tests have their own scoped job; formatting and the aggregate CI gate remain shared. These configured jobs are distinct from a recorded run, and Ubuntu test execution does not qualify Linux desktop distribution.

The earlier [signed 0.1.6 candidate](qa/2026-11-16-query-confirmation-keyboard.md#signed-016-candidate) passed app/DMG signing, notarization, stapling, Gatekeeper, packaged branding verification and all 27 production package checks with no skips. Downloaded/fresh-account installation, minimum supported macOS, remaining native credential/accessibility scenarios and final-release acceptance remain open; there is no qualified public release.

The [0.1.7 connection-deletion repair](qa/2026-11-16-connection-delete-keyboard.md#candidate-qualification) passed source checks, independent review and light/dark inspection. Its recorded production package run passed all 28 tests with no skips in 1.6 minutes. App/DMG signing, notarization, stapling, Gatekeeper and embedded branding verification are now complete. The mounted installer contains the unchanged tested application archive; the package suite was not rerun during notarization. Version 0.1.7 is the latest verified local candidate.

See [platform requirements](supported-platforms.md), [release checklist](release-checklist.md), [security](security.md), and [candidate release notes](release-notes-0.1.7.md). Rowberry is licensed under [GPL-3.0-only](../LICENSE); Baloo 2 retains its OFL license.

## Security boundary

The renderer loads only local built assets with a restrictive CSP, disabled Node integration, context isolation, and a global process sandbox. Its preload refuses to expose the bridge unless sandboxing and context isolation are active. Navigation, new windows, webviews, permission grants, and downloads are blocked. `window.dbapp` exposes only validated `request`, `subscribe`, and `unsubscribe` operations. Commands cover application info, saved connection metadata, transient secret submission, and opening/closing live database sessions. Retrieved passwords stay in main and its private database worker.

The main process accepts requests only from the registered window's exact main-frame URL and frame identity. Runtime schemas reject unknown fields and commands. Both sides validate responses/events and bound serialized payloads: control replies/events use 64 KiB, SQL requests allow 1 MiB of UTF-8 text plus a bounded envelope, query and browse pages use 16 MiB including metadata/envelope, and individual browse-value reads use 32 MiB. Control errors contain fixed messages, request identifiers, retryability, and failure outcome; SQL result pages carry bounded PostgreSQL errors and explicit completion, cancellation, limit, and unknown-outcome states. Filesystem, shell, credentials, and generic IPC are not exposed. Document operations use their own bounded contract.

Connection metadata is saved in local SQLite. Passwords use the native OS credential store when available, otherwise session-only memory. Each live workspace opens a separate database utility process; switching connections invalidates the previous generation and closes its sockets. Verified TLS is the default. Schema/table browsing and SQL execution are available; guarded table and JSON editing are available for rows with a stable identity.

## Dependency sources

Dependencies are pinned in `package.json` and `bun.lock`. Selection followed the official [Electron security guide](https://www.electronjs.org/docs/latest/tutorial/security/), [Vite requirements](https://vite.dev/guide/), [shadcn/ui manual setup](https://ui.shadcn.com/docs/installation/manual), [electron-builder packaging guide](https://www.electron.build/docs/features/multi-platform-build/), [Bun lifecycle trust documentation](https://bun.sh/docs/pm/cli/install), [Oxlint setup](https://oxc.rs/docs/guide/usage/linter/quickstart), and [Oxfmt setup](https://oxc.rs/docs/guide/usage/formatter/quickstart).

## Live PostgreSQL checks

`bun run test` runs unit and local storage checks. The existing `test:e2e` command runs desktop checks without a database. Live database checks require Docker and OpenSSL and fail if the fixtures have not been created; they do not silently skip.

```sh
# Uses OrbStack by default. Use DBAPP_DOCKER_CONTEXT=default on Linux Docker.
bun run test:postgres:setup
bun run test:integration
bun run test:e2e:postgres
bun run test:postgres:cleanup
```

The setup generates a local CA, server certificate and client certificate in a temporary directory, then starts isolated PostgreSQL 14 and 18 containers with memory-backed storage and localhost-only ports 55414/55418. The manifest is `/tmp/dbapp-task3-fixtures.json` (override with `DBAPP_POSTGRES_FIXTURES`). Credentials are fixture-only and never use the default application profile. Cleanup removes only containers bearing the task's disposable fixture label and generated keys. `compose.yaml` also supplies simple password-authenticated disposable servers; TLS/client-certificate tests use the setup above.

The live suite checks text preservation, authentication failures, verified TLS, rejected trust failures, client certificates, connection timeouts, utility worker cancellation/crashes, server-side socket cleanup, and stale session generations. The Electron UI check saves metadata in a temporary profile, submits a session-only password privately, and connects/disconnects through the actual bridge. The scoped Ubuntu PostgreSQL job provisions the same fixtures and runs both live suites, including TLS and client-certificate checks. Record actual run URLs and results when citing CI evidence; these checks do not establish a qualified Windows or Linux desktop package.

## Branding

The Rowberry berry mark, palette, and packaging icons are in `assets/branding`. The lowercase wordmark is actual text set in locally bundled Baloo 2. See [asset provenance](../assets/branding/PROVENANCE.md). Regenerate PNG, ICO, and ICNS assets locally with `bun scripts/generate-icons.mjs`. The berry vector masters contain no fonts or remote resources. Baloo 2 and its OFL licence are bundled in `src/renderer/assets/fonts`. Internal `dbapp` identifiers and the original profile directory stay stable.

## SQL workspace

Open a new SQL tab after connecting. Each of at most 16 SQL tabs uses its own PostgreSQL connection. Run executes selected text when present, otherwise the editor contents; PostgreSQL rejects multi-statement batches before executing any statement. Use Control+Space for catalog table/column completion. Results preserve raw text, OIDs and SQL NULL and remain read only. Next result page replaces the current 200 rows; it does not accumulate previous pages. The bridge accepts up to 1,000 rows per fetch and 32 outstanding operations, reserving capacity for cancellation.

BEGIN, COMMIT and ROLLBACK run explicitly on the tab connection; transaction state includes aborted and unknown. Cancel targets active work. **End unfinished result** requires confirmation because closing a portal can commit an implicit mutation. **Close SQL tab** disconnects its connection and rolls back any open transaction. Unknown cancellation/connection outcomes require explicit session reopening; no SQL is retried automatically. COPY streaming is unsupported.

Named saved queries live in `profiles.sqlite` in the application profile directory (on macOS, `~/Library/Application Support/dbapp/`). They contain SQL text and may contain sensitive values. Lists return at most 20 names per page, and individual saved SQL text is limited to 1 MiB. Opening saved SQL never executes it. Current editor drafts are also kept locally in the renderer's storage for connection-switch recovery; versioned recovery controls allow restoring or discarding drafts.
