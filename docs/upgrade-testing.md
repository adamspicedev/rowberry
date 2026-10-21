# Packaged profile upgrade test

Run two different native packages sequentially against a new temporary profile:

```sh
bun run verify:upgrade /path/to/baseline/Rowberry.app /path/to/candidate/Rowberry.app --native-vault
```

On Windows/Linux, pass the unpacked package directories containing `Rowberry.exe` or `rowberry`. Linux needs a desktop session (or `xvfb-run --auto-servernum` for the UI). Native credential testing additionally requires an available OS credential service. Omit `--native-vault` for environments without one; the output explicitly records that credential persistence was not tested. A requested native-vault test fails if storage falls back to session-only.

Select an accepted older package as the baseline and build the candidate from the revision being qualified. Keep both unchanged. The script prints both archive SHA-256 digests and rejects identical archives before creating a profile. Different digests establish different packages, not chronological ordering; the operator must record each source revision and choose the correct order.

The baseline writes connection metadata, a named SQL query, unsaved SQL and an intentionally invalid Unicode JSON draft through its application bridge. When enabled, it also stores a disposable random password through the application's credential API. The candidate reads those exact records and displays the recovered JSON as a detached copy without connecting or exposing a query execution control. A second candidate launch repeats the assertions. Native credential contents are checked through each package's own Keychain/keyring adapter and are never printed.

No existing user profile is accepted or modified. Successful runs remove the temporary profile. Failed runs retain it and print its path for diagnosis. Native-vault runs attempt to remove their unique credential in cleanup; a cleanup error fails the command. Renderer timers are controlled to avoid an unrelated debounced layout write racing the seeded fixture. Native close confirmations are accepted by the driver.

This is a packaged **profile compatibility** test. It does not install/replace an application, perform a database connection, test a fresh OS account, establish signing/notarization, or qualify an actual locked credential store. Both packages must run natively on the test host. Run the installer and native-platform procedures in [the release checklist](release-checklist.md) separately.

## Recorded local run — 21 October 2026

Passed on macOS arm64 with native Keychain checks enabled:

- Baseline: the earlier QA DMG copy built from `beae84dcf6d436b6173a70d1af0cc892ad3b5cf3`, Rowberry 0.1.0. Archive SHA-256: `4e9a9420fe1fd2389c095ab4eda1d677679ed0133536ae40940e982ebde0ada6`.
- Candidate: Rowberry 0.1.0 built from `9df5eab` plus this change's package script registration, using `bun run package --mac --arm64 --dir -c.directories.output=/tmp/rowberry-upgrade-candidate`. Archive SHA-256: `59c1a42d86fb31ce2cd4b5b906c6a622820ef48570b9fdb8a4f3d8d6f2110f31`.
- All seeded data and the native credential survived both the upgrade launch and candidate restart. The fixture credential and temporary profile were cleaned up.

This is a same-version, different-build compatibility result; it is not evidence of a versioned release upgrade or installer replacement. CI does not run it automatically because it requires an explicit baseline package and, for credential coverage, a native credential service.
