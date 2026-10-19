# dbapp

An early PostgreSQL desktop client built with Electron, React, TypeScript, shadcn/ui controls, and Tailwind. The current milestone provides a secure local shell and packaging checks. Database connections, queries, and JSON editing are planned and are not implemented yet.

The working name is dbapp. Product naming and licensing remain undecided. There is no paid tier, telemetry, remote service, release publishing, or automatic updater. Do not distribute publicly until a license and product name are selected.

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
bun run verify:package release/mac-arm64/dbapp.app arm64
```

The configuration produces unsigned development DMGs for macOS arm64/x64, Windows x64 NSIS installers, and Linux x64 AppImage/deb packages on the appropriate hosts. Use `bun run package --mac`, `--win`, or `--linux` to select a platform. Outputs are in `release/`. Verification accepts an unpacked application directory or a macOS `.app`, checks the actual executable header and bundled assets, then launches a smoke check on the host's architecture. A different architecture receives inspection only and is explicitly reported as not launched. Windows uses `release/win-unpacked x64`; Linux uses `release/linux-unpacked x64`. Linux checks need a graphical session; CI uses Xvfb.

GitHub Actions configures native build/package/smoke jobs for both macOS architectures, Windows x64, and Linux x64. These are configured checks, not evidence that CI has run. Local evidence applies only to the host tested. Windows signing, macOS signing/notarization, Linux desktop coverage, installer fresh-install checks, and public release qualification remain outstanding.

Electron 44 requires macOS 13 or newer. Windows and Linux OS minimums and credential-store coverage will be qualified before release. See the [Electron 44 release notes](https://www.electronjs.org/blog/electron-44-0).

## Security boundary

The renderer loads only local built assets with a restrictive CSP, disabled Node integration, context isolation, and a global process sandbox. Its preload refuses to expose the bridge unless sandboxing and context isolation are active. Navigation, new windows, webviews, permission grants, and downloads are blocked. `window.dbapp` exposes only validated `request`, `subscribe`, and `unsubscribe` operations. The only command currently available is `app.info`.

The main process accepts requests only from the registered window's exact main-frame URL and frame identity. Runtime schemas reject unknown fields and commands. Both sides bound serialized messages to 64 KiB of UTF-8 and validate responses/events. Errors contain fixed messages, request identifiers, retryability, and failure outcome. Filesystem, shell, credentials, and generic IPC are not exposed. Later document transport will need its own explicit bounded contract rather than increasing this control-message limit blindly.

Database operations, credential storage, and workspace persistence will be added in later milestones. No passwords or database data are stored by this shell.

## Dependency sources

Dependencies are pinned in `package.json` and `bun.lock`. Selection followed the official [Electron security guide](https://www.electronjs.org/docs/latest/tutorial/security/), [Vite requirements](https://vite.dev/guide/), [shadcn/ui manual setup](https://ui.shadcn.com/docs/installation/manual), [electron-builder packaging guide](https://www.electron.build/docs/features/multi-platform-build/), [Bun lifecycle trust documentation](https://bun.sh/docs/pm/cli/install), [Oxlint setup](https://oxc.rs/docs/guide/usage/linter/quickstart), and [Oxfmt setup](https://oxc.rs/docs/guide/usage/formatter/quickstart).
