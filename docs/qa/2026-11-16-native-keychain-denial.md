# Native Keychain denial and recovery — 16 November 2026

Result: **Pass for denied credential read, explicit retry and restart** on the local development candidate. This is partial A03 evidence, not final-v1 acceptance.

## Packages and conditions

- Host: macOS 27.3, build `26C5035r`, arm64, in the maintainer's native desktop session.
- Baseline: unsigned Rowberry 0.1.2, `release/mac-arm64/Rowberry.app`; archive SHA-256 `8ddb80f93c57bff7b6df8df9ac860b857810daf1f92eb2ab825df2bec5aef04c`.
- Candidate: signed Rowberry 0.1.3, `release-signed/0.1.3/mac-arm64/Rowberry.app`; archive SHA-256 `56ac998bfa35b8a51463dcb79b20ed287b7246a7c7502c8cd7b167d1f2cc9f86`.
- Candidate source, DMG identity and separate signing/notarization checks: [signed 0.1.3 qualification](2026-11-16-signed-013-qualification.md).
- Disposable PostgreSQL 18 fixture with verified TLS. The baseline authenticated successfully before the denial attempt.
- A new isolated profile and unique Keychain item were created by the runner. Existing user profiles and credentials were not modified. Different baseline/candidate trust identities produced the native authorization boundary; no vault failure was mocked.

```sh
DBAPP_POSTGRES_FIXTURES=/tmp/dbapp-task3-fixtures.json bun run verify:upgrade release/mac-arm64/Rowberry.app release-signed/0.1.3/mac-arm64/Rowberry.app --native-vault --deny-first
```

## Observations and assertions

The maintainer initially reported no prompt, then confirmed **Deny** for the disposable item `56227f14-1a4b-4873-a7a7-fe6b9c6c6377`. After the runner requested a retry, the maintainer confirmed access was allowed. These OS prompt actions are operator-reported; the following outcomes are automated assertions through the packaged app's normal connection service:

1. The denied read returned `CONNECTION_FAILED` and the UI remained disconnected.
2. Connection metadata, the named saved query, unsaved SQL and exact invalid Unicode JSON draft remained intact. The recovered JSON was still visible.
3. The fixture password was absent as plaintext from the isolated `profiles.sqlite*` files, including any accompanying journal files matched by that prefix. This is a bounded database-file check, not a whole-disk secret scan.
4. Explicit retry authenticated using the same retained Keychain credential without resubmitting the database password.
5. Both subsequent candidate launches preserved the records and authenticated over verified TLS without password resubmission.
6. Cleanup deleted and verified absence of the unique credential through the baseline adapter in a separate cleanup profile. The successful temporary profile was removed. Command exit: **0**.

Retained result lines:

```text
PASS denied credential read: disconnected; metadata, saved query and drafts retained; no plaintext secret in profile database files.
PASS explicit retry: authenticated using the retained credential without resubmitting it.
PASS upgrade: connection, saved query, SQL draft and exact recovered JSON, authenticated native credential
PASS candidate restart: connection, saved query, SQL draft and exact recovered JSON, authenticated native credential
PASS packaged profile upgrade; installer replacement and signing are not covered.
```

## Limits and remaining work

The harness needs a human to deny and allow actual OS prompts; a generic connection error alone is not proof of Keychain denial. See [the repeatable procedure](../upgrade-testing.md#interactive-macos-keychain-denial-and-retry).

This qualifies denied credential retrieval and recovery on these packages. Denied credential writes/deletion, a genuinely locked or unavailable store, minimum-OS coverage, fresh-account installation and final-candidate acceptance remain open. No new app package or version was needed, and this run did not install or publish the candidate.
