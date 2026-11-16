# Signed 0.1.2 candidate — 16 November 2026

The local Apple-silicon 0.1.2 app was signed with Developer ID Application for team `3MJ5T9TGR4`, with hardened runtime and a secure timestamp. `codesign --verify --deep --strict` passed with normal Keychain access. Typecheck, lint and the production build passed.

All four packaged save scenarios passed in 50.0 seconds against `release-signed/mac-arm64/Rowberry.app`: guarded cell and JSON save workflows on PostgreSQL 14 and 18, large IPC saves, and a lost real COMMIT acknowledgement with retained drafts and blocked retry. This also completes the table-comparison regression run interrupted on 27 October.

The first notarization attempt specified the login Keychain explicitly, but the stored profile was available through the default Keychain lookup. The existing valid signed app was retained and uploaded using the default lookup; no credential change was needed. Local signing instructions now omit `APPLE_KEYCHAIN`.

Apple submission: `2a29a1b5-f10c-42b0-9c60-5b26213994de`. Apple accepted the application; stapling and ticket validation passed, and Gatekeeper reports `accepted` with source `Notarized Developer ID`. The final DMG was separately signed and accepted under submission `1550f45c-c0b7-4575-b9af-46717b36921f`; its ticket was stapled and validated. Both `codesign --verify` and Gatekeeper installer assessment passed. A read-only mounted inspection verified the embedded app ticket and Gatekeeper acceptance, matched its archive to the tested app, and matched the DMG background to the checked-in branding asset byte-for-byte. Signing alone is not release acceptance. The source changes are local and have not yet passed PR CI. Nothing has been published.

Final DMG: `release-signed/Rowberry-0.1.2-mac-arm64.dmg`. SHA-256: `bf60cd667e40a6dcd84f58b907a068e2045762cae106ca81cd3e91cf731150c7`. The adjacent `SHA256SUMS` records this final stapled artifact.

## Development-build upgrade and installed copy

The standard `verify:upgrade --native-vault` gate passed from the retained unsigned 0.1.1 DMG to this signed 0.1.2 app, with real verified-TLS PostgreSQL authentication on both the upgrade launch and candidate restart. Saved connection metadata, named query, SQL draft and exact invalid Unicode JSON draft survived. The successful run cleaned up its isolated profile and fixture credential.

Baseline archive SHA-256: `ddf1edbd9665332abb86d4a72f7571724cf56fe14bc0ae14f895359cc406be2d`. Candidate archive SHA-256: `8ddb80f93c57bff7b6df8df9ac860b857810daf1f92eb2ab825df2bec5aef04c`.

Two earlier standard runs failed at connection. The maintainer confirmed macOS Keychain permission prompts were shown and approved. Diagnostic runs with an explicit preliminary credential read passed; one initial read took 6,591 ms versus 3 ms on restart. The standard gate then passed with the maintainer expecting the prompt. The existing 15-second connection budget includes credential lookup, so delayed approval is a plausible cause, not independently proven for each failed attempt. First-access timeout feedback remains a follow-up; these results do not establish prompt-free upgrades from unsigned builds.

The already-installed `/Applications/Rowberry.app` reports 0.1.2, has the same app archive as this candidate, and passes signature, stapled-ticket and Gatekeeper checks. The install itself was not observed in this run, and preservation of the maintainer's personal data was not independently compared against an earlier snapshot. The isolated test is development-build profile compatibility evidence, not a release-baseline acceptance or disposable-account installer replacement qualification.
