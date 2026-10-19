# Rowberry

An early PostgreSQL desktop client built with Electron, React, TypeScript, shadcn/ui controls, and Tailwind. The current build provides saved connections, PostgreSQL sessions, schema navigation, bounded table browsing, and raw JSON inspection. SQL execution and editing remain planned.

The approved product name is Rowberry. Licensing remains undecided. There is no paid tier, telemetry, remote service, release publishing, or automatic updater. Do not distribute publicly until a license is selected.

## Develop

Use Bun 1.4.2 and Node.js 20.19+ or 22.12+. Node is used by Electron tooling; the installed desktop application contains its own runtime.

```sh
bun install --frozen-lockfile
bun run dev
```

Development builds the local application and opens Electron. Run it again after changing source. No web server or remote content is loaded.

```sh
bun run typecheck
bun run lint
bun run format:check
bun run test
bun run build
bun run test:e2e
```

`bun run format` applies Oxfmt. Oxlint checks code. Unit tests run with Vitest and desktop tests run actual Electron through Playwright. `bun run test:integration` is reserved for the forthcoming database integration suite and currently reports no tests. Run `bun run test` rather than Bun's built-in test command to use the configured runner.

## Package and verify

```sh
bun run package
bun run verify:package release/mac-arm64/Rowberry.app arm64
```

The configuration produces unsigned development DMGs for macOS arm64/x64, Windows x64 NSIS installers, and Linux x64 AppImage/deb packages on the appropriate hosts. Use `bun run package --mac`, `--win`, or `--linux` to select a platform. Outputs are in `release/`. Verification accepts an unpacked application directory or a macOS `.app`, checks the actual executable header and bundled assets, then launches a smoke check on the host's architecture. A different architecture receives inspection only and is explicitly reported as not launched. Windows uses `release/win-unpacked x64`; Linux uses `release/linux-unpacked x64`. Linux checks need a graphical session; CI uses Xvfb.

GitHub Actions configures native build/package/smoke jobs for both macOS architectures, Windows x64, and Linux x64. These are configured checks, not evidence that CI has run. Local evidence applies only to the host tested. Windows signing, macOS signing/notarization, Linux desktop coverage, installer fresh-install checks, and public release qualification remain outstanding.

Electron 44 requires macOS 13 or newer. Windows and Linux OS minimums and credential-store coverage will be qualified before release. See the [Electron 44 release notes](https://www.electronjs.org/blog/electron-44-0).

## Security boundary

The renderer loads only local built assets with a restrictive CSP, disabled Node integration, context isolation, and a global process sandbox. Its preload refuses to expose the bridge unless sandboxing and context isolation are active. Navigation, new windows, webviews, permission grants, and downloads are blocked. `window.dbapp` exposes only validated `request`, `subscribe`, and `unsubscribe` operations. Commands cover application info, saved connection metadata, transient secret submission, and opening/closing live database sessions. Retrieved passwords stay in main and its private database worker.

The main process accepts requests only from the registered window's exact main-frame URL and frame identity. Runtime schemas reject unknown fields and commands. Both sides bound serialized messages to 64 KiB of UTF-8 and validate responses/events. Errors contain fixed messages, request identifiers, retryability, and failure outcome. Filesystem, shell, credentials, and generic IPC are not exposed. Later document transport will need its own explicit bounded contract rather than increasing this control-message limit blindly.

Connection metadata is saved in local SQLite. Passwords use the native OS credential store when available, otherwise session-only memory. Each live workspace opens a separate database utility process; switching connections invalidates the previous generation and closes its sockets. Verified TLS is the default. Querying and table editing will follow in later milestones.

## Dependency sources

Dependencies are pinned in `package.json` and `bun.lock`. Selection followed the official [Electron security guide](https://www.electronjs.org/docs/latest/tutorial/security/), [Vite requirements](https://vite.dev/guide/), [shadcn/ui manual setup](https://ui.shadcn.com/docs/installation/manual), [electron-builder packaging guide](https://www.electron.build/docs/features/multi-platform-build/), [Bun lifecycle trust documentation](https://bun.sh/docs/pm/cli/install), [Oxlint setup](https://oxc.rs/docs/guide/usage/linter/quickstart), and [Oxfmt setup](https://oxc.rs/docs/guide/usage/formatter/quickstart).

## Live PostgreSQL checks

`bun run test` runs unit and local storage checks. The existing `test:e2e` command runs desktop checks without a database. Live database checks require Docker and OpenSSL and fail if the fixtures have not been created; they do not silently skip.

```sh
# Uses OrbStack by default. Use DBAPP_DOCKER_CONTEXT=default on Linux Docker.
bun run test:postgres:setup
bun run test:integration tests/integration/connections.test.ts
bun run test:e2e:postgres
bun run test:postgres:cleanup
```

The setup generates a local CA, server certificate and client certificate in a temporary directory, then starts isolated PostgreSQL 14 and 18 containers with memory-backed storage and localhost-only ports 55414/55418. The manifest is `/tmp/dbapp-task3-fixtures.json` (override with `DBAPP_POSTGRES_FIXTURES`). Credentials are fixture-only and never use the default application profile. Cleanup removes only containers bearing the task's disposable fixture label and generated keys. `compose.yaml` also supplies simple password-authenticated disposable servers; TLS/client-certificate tests use the setup above.

The live suite checks text preservation, authentication failures, verified TLS, rejected trust failures, client certificates, connection timeouts, utility worker cancellation/crashes, server-side socket cleanup, and stale session generations. The Electron UI check saves metadata in a temporary profile, submits a session-only password privately, and connects/disconnects through the actual bridge. A separate Linux CI job provisions the same fixtures and runs both live suites, including TLS and client-certificate checks. That job has not been run locally; macOS results do not establish Windows or Linux transport results.

## Branding

The Rowberry berry mark, rounded lowercase wordmark, palette, and packaging icons are in `assets/branding`. See [asset provenance](assets/branding/PROVENANCE.md). Regenerate PNG, ICO, and ICNS assets locally with `bun scripts/generate-icons.mjs`. The vector masters contain no fonts or remote resources. Internal `dbapp` identifiers and the original profile directory stay stable.
