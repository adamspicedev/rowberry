# Unfinished-query confirmation keyboard navigation — 16 November 2026

## Reproduction and repair

On signed Rowberry 0.1.5, open a paged SQL result, focus **End unfinished result…** and press Enter. The confirmation appears, but **Keep result** does not receive focus. Like the earlier JSON discard prompt, this was an inline `alertdialog` without modal behavior or focus management. A regression reproduced the failure on PostgreSQL 18 before the repair.

Rowberry 0.1.6 uses a native modal dialog with **Keep result** focused first. Tab and Shift–Tab remain inside it. Escape and the safe action preserve both the current result and pending SQL, returning focus to the opener. This applies whether the prompt is opened directly or by trying to run another statement while a result is unfinished.

After explicit confirmation, the dialog shows progress and prevents cancellation while ending is in flight. A failed close remains visible inside the prompt and returns focus to **Keep result**. Successful ending clears the old result and focuses **Run SQL / selection**; it never executes the pending SQL automatically.

Independent review identified a second reproducible case: if the database session dies while the prompt is open, the original **Run** button is disabled. The added regression terminated only its own disposable query backend and reproduced lost focus after cancellation. The repaired fallback focuses **Reopen session** after either cancellation or explicit ending when the session is unavailable. Reopening also requires a separate explicit Run action.

## Source validation

- Query desktop workflows: **2 passed**, PostgreSQL 14 and 18, in 16.8 seconds.
- JSON draft workflows after sharing the dialog style: **2 passed**, PostgreSQL 14 and 18, in 8.8 seconds.
- Query coverage includes both entry points, both tab directions, Escape, safe-action cancellation, retained SQL and page contents, a controlled delayed/failed close, clearing an old error on reopening, successful explicit ending, actual backend loss, and no automatic SQL execution after ending or reopening.
- The controlled IPC failure is restored in test cleanup. The database-loss case targets the PID returned by the test's own query, using a disposable profile and schema.
- Typecheck, lint and production build passed. Independent review approved the final changes.
- The final visual check passed in light mode at 1280 × 768 and dark mode at 760 × 618. Button labels fit, the safe action has a visible focus ring, and the dialog remains within the window. The temporary visual test passed and was removed.

## Signed 0.1.6 candidate

- Application source: `611dfe00ec16099afd61bdab7c7f2288cedb4bc5` (before GitHub rebase).
- Host: macOS 27.3, build `26C5035r`, arm64. This is not minimum-supported-OS qualification.
- Local installer: `release-signed/0.1.6/Rowberry-0.1.6-mac-arm64.dmg`.
- DMG SHA-256: `08e7b626b99103cfb33f46672238221bb7d3b31a662feb52f4fb200d9b4e22f5`.
- `app.asar` SHA-256: `e3c205aeea64cd5d113cb62955728cf2772155110160a15b72649f717621c986`.

The app and final DMG passed Developer ID signature, Apple notarization, stapled-ticket and Gatekeeper checks. The DMG notarization submission `cb4840cc-b384-4e3c-b7cf-d13584b1bdb1` was accepted. A read-only mount confirmed the exact tested app archive, matching branded background and volume icon, a Finder background reference, and the Applications installation link. The embedded application version is 0.1.6. These checks establish the packaged branding assets, not fresh-account Finder installation.

```sh
DBAPP_NATIVE_CREDENTIAL_TEST=1 bun run verify:package release-signed/0.1.6/mac-arm64/Rowberry.app arm64
```

Result: **27 passed, zero skipped, in 1.6 minutes**. Executable architecture, renderer assets, IPC and sandboxed renderer smoke also passed. The suite includes both PostgreSQL versions of the query and JSON regressions, available native credential storage, recovery/restart, query cancellation, guarded saves and controlled failure cases. Simulated failures do not replace native denied/locked-store testing.

The website production build, typecheck, strict MkDocs build, and both documentation-search and published-route checks passed. The installer and `SHA256SUMS` are retained locally; they are not an accepted upgrade baseline or a public download.

These browser-driven keyboard checks do not establish live VoiceOver speech or resolve the separate [native Home failure](2026-11-16-signed-voiceover.md). Fresh-account installation, minimum-supported-OS coverage, final-candidate acceptance and public distribution remain open.
