# Release checklist

Current release qualification is macOS-only (arm64 and Intel x64). Windows and Linux desktop qualification is deferred; their missing native evidence does not block a macOS-only release. Existing cross-platform CI remains enabled. Public release is blocked until every required result for the macOS targets below is recorded. Local unsigned packages are development artifacts. Publishing is a separate, explicit action.

- Confirm Rowberry branding, version, GPL-3.0-only in package metadata and full LICENSE. Preserve Baloo 2's separately bundled OFL and Electron/dependency notices. Provide corresponding source and build instructions for the exact distributed version.
- Run typecheck, lint, formatting, unit, full integration, desktop and production build checks. Run PostgreSQL 14–18 CI and record run URLs. A configured workflow has not passed until it executes successfully.
- Build native macOS arm64/x64 packages for this release. Windows x64 and Linux x64 packages remain CI targets for future qualification. Run `bun run verify:package <unpacked path> <architecture>` with disposable PostgreSQL fixtures. This launches production workflows for profile persistence, DB connection, query cancellation, JSON worker benchmarks and guarded save. Tests use temporary profiles. `--assets-only` still launches the shell but omits database workflows; it is partial evidence.
- Run `bun scripts/verify-package-negative.ts <unpacked path>` to prove missing workers fail. Never remove assets from the original package.
- Run the native vault procedure in [platform requirements](supported-platforms.md) on each target desktop. Record OS/version, architecture, package digest and results, including unavailable vault fallback.
- Apply the [upgrade baseline policy](upgrade-baselines.md): verify retained baseline digests, run the native-vault upgrade gate and installer replacement for each release target, and record maintainer sign-off. Missing evidence blocks qualification; use the documented bootstrap exception only for a platform’s first release. Promote and retain the newly accepted baseline after acceptance.
- On fresh user accounts install each installer, connect to disposable databases, save/reopen a query and draft, cancel a query and save guarded JSON. Upgrade from the previous accepted version and verify profiles, vault entries, queries and drafts survive. Keep internal `dbapp` storage identifiers. Uninstall and document retained user data. Automated temporary-profile restart checks do not establish installer upgrade behaviour.
- Dispatch **Signed release candidates** with `platform: macos` (the default) for the current release. This selects both Mac architectures without creating a Windows job or requesting its environment approval. Supply credentials through the protected `release-signing-macos` environment. The `windows` and `all` choices are reserved for future Windows qualification and additionally use `release-signing-windows`. `CSC_LINK` and `CSC_KEY_PASSWORD` identify the externally supplied signing certificate. macOS also needs `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, and `APPLE_TEAM_ID` for notarization. No identity is supplied by the repository. The manual signed-candidate workflow forces signing, validates Windows Authenticode and macOS codesign/Gatekeeper/stapling, and uploads artifacts without publishing. Never treat an unsigned build as a signed candidate.
- Run full production smoke again against the exact signed candidate. Verify macOS signing and notarization with `codesign --verify --deep --strict`, `spctl --assess --type execute`, and `xcrun stapler validate`. Record evidence. Missing signing credentials or native evidence for an intended macOS architecture remains a release blocker. Windows signing and desktop evidence become required when Windows enters release scope.
- Generate `bun scripts/checksums.ts` after signing. Deliver versioned packages, SHA256SUMS, corresponding source, license notices and release notes together. Confirm checksums after download. Review [draft notes](release-notes-0.1.0.md), then obtain explicit publishing approval. No automatic updater is configured; users install the new version manually with the app closed.

## Current acceptance state

The dated sections below distinguish automated CI evidence, local package behavior, and outstanding native desktop qualification. No public release has been created.

## QA evidence, 21 October 2026

The [macOS packaged-workspace QA report](qa/2026-10-21-macos.md) records commit and package digests, screenshots, successful verified-TLS connection, Keychain-backed reconnects across process restarts, saved SQL queries, exact detached draft recovery, and durable explicit discard. Two existing packaged credential tests also passed. Native UI deletion removed a confirmed live Keychain credential and its connection profile, with both still absent after restart, and visual inspection confirmed a settled empty workspace. The app was copied from its DMG into an isolated directory and used a fresh application profile on the existing macOS account.

This is partial release qualification: fresh-account installation, installer upgrades, signing/notarization, real locked-store behavior, and other native desktops remain open. The confusing reconnect warning for retained recovered copies is fixed in this change and covered by a desktop regression; the recorded DMG predates this fix.

Before this QA pass, all nine required CI jobs passed at `e5f8cbf`: [checks](https://github.com/adamspicedev/rowberry/actions/runs/39532511031), [PostgreSQL and version compatibility](https://github.com/adamspicedev/rowberry/actions/runs/39532511170), and [four-platform package verification](https://github.com/adamspicedev/rowberry/actions/runs/39532511102). Those results supersede the historical “CI unrun” entries below; they do not qualify fresh-account installation or native credential behavior on every platform.

A repeatable [packaged profile upgrade test](upgrade-testing.md) now verifies connection metadata, saved queries, SQL drafts, detached JSON and optional native credentials across two distinct builds and a candidate restart. The recorded macOS run passed; installer replacement and versioned-release upgrades remain separate gates.

## Local evidence, 20 October 2026

Reference host: Apple Silicon macOS 27.2, Bun 1.4.3, Node 20.20.2, Electron 44.9.0. CI pins Bun 1.4.2 and has not run in this session.

| Gate                                                         | Recorded state                                                |
| ------------------------------------------------------------ | ------------------------------------------------------------- |
| Typecheck, Oxlint, Oxfmt                                     | Passed locally, including release TypeScript scripts          |
| Unit and local storage                                       | 55 passed, native vault test skipped by default               |
| Full PostgreSQL 14/18 integration                            | 117 passed, native vault opt-in skipped                       |
| Final-review PG14/18 regressions                             | 22 focused integration passes; 4 desktop JSON recovery checks |
| Native Keychain opt-in                                       | 1 passed, set/get/restart/delete with disposable entry        |
| Development desktop                                          | 11 passed before the additional reopen regression test        |
| Unsigned macOS packages                                      | arm64 and x64 DMGs built; no signing attempted                |
| Missing worker / enabled Node / missing executable           | All rejected by negative package checks                       |
| Production packaged workflows                                | 18/18 passed on local macOS arm64, including PG14/18          |
| Packaged native Keychain opt-in                              | 1/1 passed on local macOS arm64; disposable vault entry       |
| Intel macOS runtime                                          | Architecture/assets inspected only; no native x64 run         |
| CI and PostgreSQL 15–17                                      | Configured, unrun                                             |
| Windows/Linux desktop, signing/notarization, install/upgrade | Pending; public release blockers                              |
| Publication                                                  | No release or remote created                                  |

The cross-built Intel package lacks the host-unavailable x64 native vault optional dependency. Its static pass does not qualify Intel password persistence. Build and test again on the native Intel runner. Electron's unsigned macOS task-port diagnostics and Vite's 3.27 MB Monaco chunk warning remain visible; neither is counted as platform or signature evidence.

Production benchmark on this host used 11,888,891 bytes and 100,000 scalar values: parse 387.1 ms, indexed search 30.6 ms, search cancellation 7.1 ms, parse cancellation 6.5 ms. UI expansion measured 23.0–23.6 ms and selection 7.6–7.9 ms. These are local measurements. The production worker came from the packaged app archive.

Unsigned development package SHA-256 digests, recompute after signing:

```text
4f0af42334d9394ef27909abe5df47645a96b4e663a79afd84588d675b091b24  Rowberry-0.1.0-mac-arm64.dmg
d4103607eb6262cf31b6fa56f73f12edec18a40b0b2a43813ffdf2c194ea6be7  Rowberry-0.1.0-mac-x64.dmg
```
