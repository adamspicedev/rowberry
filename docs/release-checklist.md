# Release checklist

Public release is blocked until every required platform result below is recorded. Local unsigned packages are development artifacts. Publishing is a separate, explicit action.

- Confirm Rowberry branding, version, GPL-3.0-only in package metadata and full LICENSE. Preserve Baloo 2's separately bundled OFL and Electron/dependency notices. Provide corresponding source and build instructions for the exact distributed version.
- Run typecheck, lint, formatting, unit, full integration, desktop and production build checks. Run PostgreSQL 14–18 CI and record run URLs. A configured workflow has not passed until it executes successfully.
- Build native macOS arm64/x64, Windows x64 and Linux x64 packages. Run `bun run verify:package <unpacked path> <architecture>` with disposable PostgreSQL fixtures. This launches production workflows for profile persistence, DB connection, query cancellation, JSON worker benchmarks and guarded save. Tests use temporary profiles. `--assets-only` still launches the shell but omits database workflows; it is partial evidence.
- Run `bun scripts/verify-package-negative.ts <unpacked path>` to prove missing workers fail. Never remove assets from the original package.
- Run the native vault procedure in [platform requirements](supported-platforms.md) on each target desktop. Record OS/version, architecture, package digest and results, including unavailable vault fallback.
- On fresh user accounts install each installer, connect to disposable databases, save/reopen a query and draft, cancel a query and save guarded JSON. Upgrade from the previous accepted version and verify profiles, vault entries, queries and drafts survive. Keep internal `dbapp` storage identifiers. Uninstall and document retained user data. Automated temporary-profile restart checks do not establish installer upgrade behaviour.
- Supply signing credentials through the protected `release-signing-macos` and `release-signing-windows` environments, scoped per platform. `CSC_LINK` and `CSC_KEY_PASSWORD` identify the externally supplied signing certificate. macOS also needs `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, and `APPLE_TEAM_ID` for notarization. No identity is supplied by the repository. The manual signed-candidate workflow forces signing, validates Windows Authenticode and macOS codesign/Gatekeeper/stapling, and uploads artifacts without publishing. Never treat an unsigned build as a signed candidate.
- Run full production smoke again against the exact signed candidate. Inspect Windows installer and executable signatures, and macOS notarization with `codesign --verify --deep --strict`, `spctl --assess --type execute`, and `xcrun stapler validate`. Record evidence. Missing credentials or any non-local platform evidence remains a release blocker.
- Generate `bun scripts/checksums.ts` after signing. Deliver versioned packages, SHA256SUMS, corresponding source, license notices and release notes together. Confirm checksums after download. Review [draft notes](release-notes-0.1.0.md), then obtain explicit publishing approval. No automatic updater is configured; users install the new version manually with the app closed.

## Current acceptance state

The table below records checked-in local evidence. CI execution, Windows/Linux desktops, Intel macOS execution, signatures/notarization, fresh installation and installer upgrade remain unverified unless explicitly recorded there. No public release has been created.

## Local evidence, 20 October 2026

Reference host: Apple Silicon macOS 27.2, Bun 1.4.3, Node 20.20.2, Electron 44.9.0. CI pins Bun 1.4.2 and has not run in this session.

| Gate                                                         | Recorded state                                         |
| ------------------------------------------------------------ | ------------------------------------------------------ |
| Typecheck, Oxlint, Oxfmt                                     | Passed locally, including release TypeScript scripts   |
| Unit and local storage                                       | 51 passed, native vault test skipped by default        |
| Full PostgreSQL 14/18 integration                            | 117 passed, native vault opt-in skipped                |
| Native Keychain opt-in                                       | 1 passed, set/get/restart/delete with disposable entry |
| Development desktop                                          | 11 passed before the additional reopen regression test |
| Unsigned macOS packages                                      | arm64 and x64 DMGs built; no signing attempted         |
| Missing worker / enabled Node / missing executable           | All rejected by negative package checks                |
| Intel macOS runtime                                          | Architecture/assets inspected only; no native x64 run  |
| CI and PostgreSQL 15–17                                      | Configured, unrun                                      |
| Windows/Linux desktop, signing/notarization, install/upgrade | Pending; public release blockers                       |
| Publication                                                  | No release or remote created                           |

The cross-built Intel package lacks the host-unavailable x64 native vault optional dependency. Its static pass does not qualify Intel password persistence. Build and test again on the native Intel runner. Electron's unsigned macOS task-port diagnostics and Vite's 3.27 MB Monaco chunk warning remain visible; neither is counted as platform or signature evidence.

Production benchmark on this host used 11,888,891 bytes and 100,000 scalar values: parse 357.9 ms, indexed search 37.3 ms, search cancellation 7.2 ms, parse cancellation 5.7 ms. UI expansion measured 24.7–27.7 ms and selection 11.1–15.0 ms. These are local measurements. The production worker came from the packaged app archive.

Unsigned development package SHA-256 digests, recompute after signing:

```text
50464658fb9c7c55720c4dc554521d890f00e5f6b85d6aa67afeba1b63e5dd09  Rowberry-0.1.0-mac-arm64.dmg
565f5d451495090cead2297bef74cf6aee9cbf81a8d07cfec2d893705f6b5a02  Rowberry-0.1.0-mac-x64.dmg
```
