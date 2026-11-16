# Connection deletion and keyboard focus — 16 November 2026

## Reproduction and repair

Two failures were reproduced on signed Rowberry 0.1.6 with disposable connection profiles:

1. Open deletion from **More connection actions** and press Escape. The modal closes, but focus does not return to the visible actions trigger.
2. Hold a deletion reply, dismiss its confirmation with Escape, select another connection and type a new unsaved name. When the original deletion completes, the other connection's editor disappears and its draft is lost.

Rowberry 0.1.7 keeps the native modal mounted and explicitly restores focus. **Cancel** receives initial focus, Tab stays inside the prompt, and cancellation before submission returns to **More connection actions**. Successful deletion focuses **New connection** because the original editor has been removed.

A synchronous pending guard prevents repeated deletion, cancellation and connection changes while the request is in flight. Pending deletion also activates the existing workspace/unload busy protection. Progress and failures stay inside the dialog; failure restores **Cancel** focus and leaves the current editor available. A new attempt clears the previous error.

Failure wording no longer assumes credential deletion was the cause: a metadata-store failure can occur after the saved credential was removed. The renderer displays the service's sanitized error. This repair does not change the deletion service or establish native Keychain-denial behavior.

## Source validation

- Focused regression: **1 passed** in 2.1 seconds after the two red reproductions.
- Complete connection-manager test file: **5 passed**, one native-vault opt-in test skipped, in 15.7 seconds. Native packaged verification is recorded separately below.
- Coverage includes safe initial focus, both tab directions, Escape and Cancel focus return, a single held request, blocked dismissal/duplicate actions, workspace busy protection, an in-dialog failure, persisted metadata retention, explicit retry through the real deletion service, and focus after success.
- The IPC gate is restricted to a disposable profile and restored in cleanup. No real user credential is created or deleted by that controlled-failure regression.
- Typecheck, lint, production build and formatting passed. Independent review approved the final source and regression.
- Light and dark visual checks passed at 1280 × 800 and 760 × 650 window sizes. The modal fits, the safe action has visible focus, and cancellation returns to the actions trigger. The temporary visual test was removed.

## Candidate qualification

Application source: `86747b92fe40b98e8f79fcbf73ddbfd43ad32933`. The build used identical application source from pre-rebase commit `c71561fdcc609b0b0b98de3d096f6f7a1db413a5`.

- Host: macOS 27.3, build `26C5035r`, arm64.
- Local application: `release-signed/0.1.7/mac-arm64/Rowberry.app`.
- `app.asar` SHA-256: `c81f33c3e6cd13c533c4167da4a441f0025d0f706f8dac25e3dbbd06427c26e3`.
- The embedded version is 0.1.7. All 14 bundled application files match the frozen build output.
- Developer ID signature verification passed with `codesign --verify --deep --strict`.

```sh
DBAPP_NATIVE_CREDENTIAL_TEST=1 bun run verify:package /Users/spicey/Projects/dbapp/release-signed/0.1.7/mac-arm64/Rowberry.app arm64
```

Run from the worktree containing the new regression: **28 passed, zero skipped, in 1.6 minutes**. Executable architecture, renderer assets, IPC and sandboxed renderer smoke also passed. This includes available native credential storage, the connection-deletion regression, PostgreSQL 14/18 workflows, recovery, guarded saves and controlled failures.

Notarization stopped before submission because `notarytool` could not find the saved `rowberry-notary` profile. The same lookup failed from the main workspace and when explicitly selecting the login Keychain. The user was asked to restore the profile interactively; no credential was requested in chat. The signed application and a submission archive are retained so notarization can resume without rebuilding. **0.1.7 app notarization, stapling, Gatekeeper and final-DMG qualification remain pending.** The latest fully verified local app/DMG pair remains [0.1.6](2026-11-16-query-confirmation-keyboard.md).

Browser-driven keyboard tests do not qualify live VoiceOver or the separate [native Home issue](2026-11-16-signed-voiceover.md). Fresh-account installation, minimum-supported-OS coverage and final-release acceptance remain open.
