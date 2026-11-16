# Native denied password save — 16 November 2026

Result: **Pass for denied password storage, usable session-only fallback and forgetting the password on restart**. This qualifies the scenario on a development candidate, not final-v1 acceptance.

## Candidate and procedure

- Host: macOS 27.3, build `26C5035r`, arm64, in the maintainer's desktop session.
- Baseline: unsigned Rowberry 0.1.2, `release/mac-arm64/Rowberry.app`; archive SHA-256 `8ddb80f93c57bff7b6df8df9ac860b857810daf1f92eb2ab825df2bec5aef04c`.
- Candidate: signed Rowberry 0.1.4, `release-signed/0.1.4/mac-arm64/Rowberry.app`; archive SHA-256 `3fe78a8edbb9b45163635b74797de1b3367d3faab36195486a40e416a296661e`.
- Candidate source: merge `eecd6736d369476b01a765af32afa576ae48d982`, matching the app source and package metadata built from `900f12219abdd1bad903d9639c45ee76446d7e0b`.
- Separate [signed-package qualification on PR #32](https://github.com/adamspicedev/rowberry/pull/32#issuecomment-6905593768) records 27 packaged checks, signed upgrade/restart, signatures, app/DMG notarization and stapling, Gatekeeper acceptance and matching DMG branding. Final DMG SHA-256: `d60098eecdda6a621403d38d93533a63c9c52423ffcfbe0f6c7b88d260839224`.
- A new isolated application profile, unique native Keychain item and disposable PostgreSQL 18 fixture with verified TLS were used. No real user profile, credential or Keychain access rule was changed.

```sh
DBAPP_POSTGRES_FIXTURES=/tmp/dbapp-task3-fixtures.json bun run verify:upgrade release/mac-arm64/Rowberry.app release-signed/0.1.4/mac-arm64/Rowberry.app --native-vault --deny-write
```

The baseline stored a valid credential and authenticated. The candidate advertised available storage, opened the saved profile through the UI and attempted to save the fixture password with persistence selected. The maintainer confirmed choosing **Deny** on the native prompt for disposable item `3ff158e2-9b42-403a-a3ea-5c03585b9013`. This operator action is reported evidence; the outcomes below are automated assertions against the real packaged app and native adapter. No failure was injected or mocked.

## Results

1. The password input cleared, the inline message explicitly reported session-only storage, and the connection-specific alert was visible.
2. The saved query, SQL draft and exact invalid Unicode JSON draft remained intact. No plaintext fixture password appeared in the isolated `profiles.sqlite*` files; this is a bounded database-file check, not a whole-disk scan.
3. The same app process authenticated to PostgreSQL using the transient password, without another password submission.
4. Both subsequent candidate launches retained connection metadata/query/drafts and failed to reconnect without a password. Explicit connection tests with the known fixture password succeeded, ruling out a broken fixture without restoring the profile's transient credential.
5. Cleanup verified the baseline's original valid native credential still existed, then deleted it and verified its absence. Thus restart did not silently reuse that old credential. The successful temporary profile was removed. Command exit: **0**.

```text
PASS denied password save: visible session-only warning, cleared input, retained query/drafts, no plaintext password in profile database files and authenticated transient session.
PASS upgrade: connection, saved query, SQL draft and exact recovered JSON, session password forgotten and old saved credential not reused
PASS candidate restart: connection, saved query, SQL draft and exact recovered JSON, session password forgotten and old saved credential not reused
PASS packaged profile upgrade; installer replacement and signing are not covered.
```

An initial harness attempt stopped before the native save because the recovered-draft dialog intercepted the connection-selection click. The runner now uses **Keep local copies** before opening the editor. Cleanup completed on that failed attempt, retaining its temporary profile for diagnosis; it was not a product credential failure.

## Limits

This exercises denial of an existing item's password save after an initially successful capability probe. It does not establish behaviour of a wholly locked/unavailable store or a denied deletion. The read-denial/retry scenario has [separate 0.1.3 evidence](2026-11-16-native-keychain-denial.md). The full 0.1.4 suite covers the primary Connect warning flow with controlled failures; this native run uses **Save without connecting**, followed by an explicit service connection.

No app source change, version bump, installation replacement or publication was needed. Final-candidate, minimum-OS and fresh-account qualification remain separate gates. See [the repeatable manual procedure](../upgrade-testing.md#interactive-macos-denied-password-save).
