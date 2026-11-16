# JSON discard keyboard navigation — 16 November 2026

## Reproduction and repair

On signed Rowberry 0.1.4, press Enter on **Close JSON** with an unsaved JSON draft. The discard prompt appears, but keyboard focus remains on the opening button. The prompt was an inline `alertdialog` without modal behavior or focus management.

The regression failed on PostgreSQL 18 at the assertion that **Keep editing JSON** receives focus. The fixture used an isolated profile and duplicate-key JSON, preserving the invalid source text through cancellation.

Rowberry 0.1.5 uses a native modal dialog. **Keep editing JSON** receives initial focus, the background workspace is inactive, and Tab/Shift–Tab stay within the confirmation. Escape and **Keep editing JSON** close the prompt and return focus to its opener. **Discard and close JSON** remains an explicit choice.

The prompt uses the existing light/dark theme and a viewport-bounded layout. Its accessible description is associated with the confirmation message, following the [alert dialog pattern](https://www.w3.org/WAI/ARIA/apg/patterns/alertdialog/).

## Validation

- Development Electron regressions: **2 passed**, PostgreSQL 14 and 18, in 10.0 seconds.
- Both entry points: **Close JSON** and **Discard draft…**.
- Both tab directions, Escape, Enter on the safe action, reopening, and focus restoration.
- Exact duplicate-key draft text remains after cancellation; explicit keyboard discard closes the inspector.
- Typecheck, lint and production build passed. Independent review found no actionable issues.
- Final visual and keyboard check passed in light mode at 1280 × 768 and dark mode at 760 × 618. Both buttons use the shared component, labels fit, the safe action has a visible focus ring, and cancellation restores focus. The temporary check completed successfully and was removed afterward.

## Signed 0.1.5 candidate

- Source: `a0b008e67c54d8e18cf72abda030b4aecbb3d332`, [PR #36](https://github.com/adamspicedev/rowberry/pull/36), merged after all required CI checks passed. The build used identical application source from pre-rebase commit `a7fab65408edf7193eb53325d43690a9778e579c`.
- Host: macOS 27.3, build `26C5035r`, arm64. This is not minimum-supported-OS qualification.
- Local installer: `release-signed/0.1.5/Rowberry-0.1.5-mac-arm64.dmg`.
- DMG SHA-256: `07685877d993fef2b316429576a049465d1a3c73c84708392d9dba80f1132801`.
- `app.asar` SHA-256: `30939e33d67a16a2e2b5c6763bed256949b4a5f3cadc46bb2511deaa3d19992a`.

The app and final DMG passed Developer ID signature, Apple notarization, stapled-ticket and Gatekeeper checks. A read-only mount confirmed that the DMG contains the exact tested app archive, matching branded background and volume icon, a Finder background reference, and the Applications installation link. This verifies packaged branding assets, not a fresh-account Finder installation.

```sh
DBAPP_NATIVE_CREDENTIAL_TEST=1 bun run verify:package release-signed/0.1.5/mac-arm64/Rowberry.app arm64
```

Result: **27 passed, zero skipped, in 1.7 minutes**. Executable architecture, renderer assets, IPC and sandboxed renderer smoke also passed. The suite included the new keyboard regression on PostgreSQL 14/18, available native credential storage, recovery/restart, query cancellation, guarded saves and controlled failure cases in disposable profiles. These simulated failure cases do not replace the separate native denied/locked-store scenarios.

The installer and `SHA256SUMS` are retained locally. They are not an accepted release baseline or a published download. Fresh-account installation, downloaded-artifact checks, final-candidate acceptance and public distribution remain open.

These checks use browser-driven keyboard events. They do not qualify live VoiceOver speech or resolve the separate [native Home failure](2026-11-16-signed-voiceover.md).
