# Signed 0.1.3 production qualification — 16 November 2026

This records an automated development-candidate result, not final-v1 acceptance or publication approval.

## Candidate identity

- Source: merged commit `7cac55de8cec760598683ee50c9c7b076f3b88bd` ([PR #29](https://github.com/adamspicedev/rowberry/pull/29)). The package was built from PR commit `63a85da`; application source and package metadata match the merged revision.
- Version and target: 0.1.3, macOS arm64.
- Test host: macOS 27.3, build `26C5035r`, arm64. This does not qualify the minimum supported macOS version.
- Local DMG: `release-signed/0.1.3/Rowberry-0.1.3-mac-arm64.dmg`.
- Final stapled DMG SHA-256: `d8d588e9ce1d4f1ea3cdd8ec38502abc2fb4c9826d6887ec35b0314b98e59c08`.
- Application archive SHA-256: `56ac998bfa35b8a51463dcb79b20ed287b7246a7c7502c8cd7b167d1f2cc9f86`.
- Local files are staging artifacts, not durable distribution storage or an accepted upgrade baseline.

## Signing and upgrade evidence

[Final artifact checks on PR #29](https://github.com/adamspicedev/rowberry/pull/29#issuecomment-6905066791) record valid Developer ID signatures, accepted app and DMG notarization, stapled-ticket validation, Gatekeeper acceptance, matching embedded archive and branding, and a passing signed 0.1.2-to-0.1.3 native-vault upgrade/restart test. The upgrade used isolated profiles and verified-TLS PostgreSQL authentication without resubmitting the stored fixture password. It preserved metadata, saved queries, SQL drafts and exact recovered JSON. It does not replace disposable-account installer qualification.

PR and [post-merge main CI](https://github.com/adamspicedev/rowberry/actions/runs/43787838880) passed. The separate [connection-timing report](2026-11-16-keychain-wait.md) covers 22 integration and five desktop session checks, including controlled delayed credential resolution and cancellation. Native VoiceOver was not rerun on this candidate.

## Full signed production package run

```sh
DBAPP_NATIVE_CREDENTIAL_TEST=1 bun run verify:package release-signed/0.1.3/mac-arm64/Rowberry.app arm64
```

Result: **25 passed, zero skipped, in 1.8 minutes**, exit 0. Executable architecture, renderer assets, IPC and sandboxed renderer smoke also passed. Tests used disposable PostgreSQL 14/18 fixtures and isolated profiles.

The suite covers connection testing and metadata, real available-store Keychain round trips, simulated unavailable storage, connection-operation races, JSON and query workflows, crash/restart recovery and durable discard, guarded saves on PG14/18, large IPC saves, lost COMMIT acknowledgement, schema menus and notification undo, and renderer/security boundaries. The simulated unavailable-store scenario does **not** establish real denied/locked Keychain behaviour. This run does not requalify the opt-in memory soak or native VoiceOver checks.

No code change or rebuild was needed for this qualification run.

## Remaining gates

- Actual denied/unavailable native credential storage and its recovery path.
- Uncoached task observations by unfamiliar users and the resulting export-scope decision.
- Minimum supported OS, fresh-account signed installation, downloaded-artifact checks and broader performance qualification.
- Durable candidate storage, explicit baseline/bootstrap acceptance and publication approval.
- Protected GitHub signing credentials if remote signing is used; local Keychain setup does not configure them.

The authoritative [release checklist](../release-checklist.md), [to-do list](../v1-todo.md) and [baseline policy](../upgrade-baselines.md) remain open for these requirements.
