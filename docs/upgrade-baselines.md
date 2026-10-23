# Upgrade baseline policy

Every release candidate must preserve profiles from the latest accepted release for each platform and architecture it will support. Acceptance is a maintainer decision recorded with evidence; passing CI alone does not promote a package.

Current v1 scope is macOS arm64 only. Intel Macs, Windows and Linux are deferred and are not release gates until explicitly added to scope. Desktop package CI targets arm64 only; other desktop targets are paused.

## Baseline register

No release baseline has been accepted yet. The packages used in the October 2026 QA reports are development evidence, not accepted release baselines.

| Target      | Accepted baseline | Retained package and checksums | Acceptance evidence  |
| ----------- | ----------------- | ------------------------------ | -------------------- |
| macOS arm64 | Pending           | Pending                        | Pending              |
| macOS x64   | Deferred          | Not yet required               | Out of current scope |
| Windows x64 | Deferred          | Not yet required               | Out of current scope |
| Linux x64   | Deferred          | Not yet required               | Out of current scope |

For each accepted target, replace its Pending entries with a link to a versioned baseline record under `docs/qa/`. That record must contain the version, full source commit, OS/architecture, acceptance date and maintainer, durable artifact location, installer SHA-256, unpacked `app.asar` SHA-256, signing status, and links to installation, credential-store and persistence results. For Linux, record the distribution/session and both AppImage and deb installer results if both are distributed.

## Retain the exact packages

Before promoting a baseline, retain the exact distributed installer, SHA256SUMS, source revision, and a platform-native archive of its unpacked application. Preserve executable permissions, symlinks and signing metadata; do not reconstruct the baseline from source later. Verify the installer and app archive digests after retrieving or unpacking them. Never store credentials or test-user profiles alongside packages.

Use versioned GitHub Release assets after publication is approved, or access-controlled durable storage for private candidates. Record the exact asset/object identifier and checksum, not a moving `latest` link. Do not replace an accepted object in place. CI artifacts and local `/tmp` files are staging locations, not the retained baseline. Keep accepted baselines for as long as users may upgrade from them; do not delete the previous baseline when promoting the next one.

## Required gate for each candidate

1. Record the candidate source commit, version, OS/architecture and final package digests. Test the exact packages intended for distribution, after signing where applicable.
2. Retrieve the registered baseline for the same platform/architecture and verify its recorded digests. Missing or mismatched artifacts block qualification.
3. Run [the packaged upgrade test](upgrade-testing.md) with `--native-vault` in a logged-in native desktop session and disposable PostgreSQL fixtures. Retain command output, both package digests, OS details, exit status and date in the candidate's QA record. Profile-only mode is supplementary and cannot satisfy credential qualification.
4. Separately replace the installed baseline with the candidate using the actual installer in a disposable OS account. Verify saved connections, credentials, queries and drafts survive, and document retained data on uninstall. The script's temporary-profile test does not cover this step.
5. A maintainer reviews both results for every intended target. Any failed or missing required result blocks that target's release. A narrower release scope must be explicit; another platform's pass is not a substitute.
6. After release acceptance, add a new immutable baseline record and update the register through a reviewed PR. Leave the previous record and artifacts available. Do not promote the candidate before testing it against the old baseline.

This is a manual release gate enforced by the release checklist and maintainer sign-off. CI does not yet download registered baselines or automatically enforce this policy. Automated publication remains disabled.

## First-release bootstrap

A platform with no previously distributed version cannot produce a release-to-release upgrade result. Its first candidate must pass fresh installation, native credentials, persistence and the other release checks. Record the lack of a prior release and an explicit maintainer-approved bootstrap exception in its acceptance record. A distinct development-build upgrade test is useful supplementary evidence, but must not be labelled a release upgrade. The accepted first release then becomes that platform's baseline. A missing baseline on a platform with an existing release is not a bootstrap exception.

## Candidate evidence template

Copy this into a dated file under `docs/qa/` and complete every field before sign-off:

- Target OS/version, architecture, desktop session and tester:
- Baseline record, version, full source commit and durable artifact identifiers:
- Verified baseline installer and app.asar SHA-256:
- Candidate version, full source commit, artifact identifiers and SHA-256:
- Signing/notarization checks, where applicable:
- Native-vault upgrade command, exit status, date and retained log:
- Installer replacement procedure and observed persistence results:
- Credential retrieval, deletion and unavailable-store results:
- Failures, unresolved limitations and release scope:
- Maintainer decision, name/date and any first-release bootstrap exception:
