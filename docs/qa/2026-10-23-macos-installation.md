# macOS bundle replacement and reinstall — 23 October 2026

This is local unsigned Apple Silicon evidence, not release acceptance. The candidate was built from `3af0c571fa70dc5b66e1fc5ac8e837e6714a1d3a`, with only installation documentation edits in the checkout. Host: macOS 27.2 (26B118), arm64. Both builds report version 0.1.0; this tests different builds, not an upgrade between accepted versioned releases.

## Package identity

| Artifact                   | SHA-256                                                            |
| -------------------------- | ------------------------------------------------------------------ |
| Existing baseline app.asar | `4e9a9420fe1fd2389c095ab4eda1d677679ed0133536ae40940e982ebde0ada6` |
| Candidate app.asar         | `59c1a42d86fb31ce2cd4b5b906c6a622820ef48570b9fdb8a4f3d8d6f2110f31` |
| Candidate arm64 DMG        | `25fef0648336914e72bd03b1bc18abcca62c3f9f72b7fba887ad1830e3d3ce9a` |

The DMG was mounted read-only, its application copied out with `ditto`, and the image ejected before testing. Candidate output and local diagnostic logs were placed under `/tmp/rowberry-install-qa-20261023`; temporary files are not retained release artifacts.

## Lifecycle results

A temporary adaptation of `scripts/verify-upgrade.ts` installed both builds at the same disposable `<profile>/Applications/Rowberry.app` path. Before each different build was launched, the closed app bundle was removed and copied from its source, and its archive digest checked. The existing macOS account was used with an isolated application profile and a disposable Keychain credential.

- Baseline to candidate replacement passed: connection metadata, named query, SQL draft and exact invalid Unicode JSON recovery were preserved.
- Candidate restart passed the same checks.
- Removing only the closed application bundle left `profiles.sqlite` byte-for-byte unchanged. Reinstalling the candidate passed all recovery checks again.
- Each candidate phase authenticated against the disposable PostgreSQL 18 server using the remembered native credential, without submitting the password again. Startup remained disconnected until explicitly connected.
- Credential cleanup succeeded using the baseline with a separate cleanup profile; the migrated test profile and installed bundle were removed after success. The normal user profile was not used.

The base runner's final message still says installer replacement is not covered: that is correct for the checked-in runner. This local adaptation adds automated bundle copying/removal only. It does not establish Finder installation, a standard Applications location, quarantine prompts or Gatekeeper behavior.

## Production verification

`DBAPP_NATIVE_CREDENTIAL_TEST=1 bun run verify:package <extracted-app> arm64`, with the disposable PostgreSQL fixture manifest, passed all **21 tests** in 1.4 minutes. This included PostgreSQL 14/18 guarded saves, SQL cancellation and recovery, JSON workers, IPC/security and native Keychain checks. Executable architecture and packaged assets passed inspection. `verify-package-negative.ts` rejected missing JSON workers, enabled renderer Node integration and a missing executable. Disposable database containers and their fixture files were removed successfully afterward.

Documentation formatting and `git diff --check` passed. This report does not claim a new CI run or signed-package verification.

## Fresh-account manual acceptance

The operator created standard account `rowberryqa`; the active console account was independently confirmed before testing. Desktop automation remained attached to `spicey`, so the following results are operator-reported unless otherwise stated.

- Opened the supplied DMG in Finder, copied the app into Applications and authenticated with a fingerprint to overwrite the existing bundle. The operator reported that the app opened without issue. `/Applications/Rowberry.app/Contents/Resources/app.asar` was subsequently hashed and matches the candidate above. This was a fresh account using a replaced shared application, not a machine with no previous installation. Disk-image ejection and the exact launch path were not independently observed.
- Initial workspace was empty, with no inherited saved connections or recovered drafts.
- Connected to the disposable PostgreSQL fixture. A supplied photo independently shows a successful one-row query result identifying PostgreSQL 18.6. Connection instructions specified verify-full TLS; the photo does not independently prove the selected TLS mode.
- After quitting and reopening, reconnected without entering the password.
- Named query and distinct unsaved Unicode SQL draft survived restart, as checked by the operator.
- Cancelled `SELECT pg_sleep(30)` and successfully ran `SELECT 1` afterward.
- Edited the disposable table's JSON, confirmed the database save, and reported success after instructions to requery the stored value.

The JSON save action was difficult to discover: the operator needed guidance to find **Save to database** and **Confirm save**, then reported that the interface needs substantial improvement. This is an open usability finding even though the functional check passed. Exact Keychain prompt behavior was not reported. Detached JSON draft recovery in this account and locked-Keychain behavior remain untested.

All nine PR #5 checks passed at `c7f1d186f603bf6fbd0ecd6eaae4a48d7298a5d2`: [checks](https://github.com/adamspicedev/rowberry/actions/runs/39839111007), [PostgreSQL](https://github.com/adamspicedev/rowberry/actions/runs/39839111067), and [packages](https://github.com/adamspicedev/rowberry/actions/runs/39839111016). Intel CI does not establish interactive Intel desktop qualification.

## Remaining acceptance gates

Signed/downloaded first-launch security prompts; remaining fresh-account JSON draft recovery and credential-denial cases; Intel desktop runtime and native vault checks; actual locked-store behavior; signed/notarized candidates and their full smoke tests; accepted baseline and maintainer sign-off. No valid local code-signing identities were found. Windows and Linux qualification remains deferred. No baseline was promoted and no release was published.
