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

Signed-package and installer checks are pending. Browser-driven keyboard tests do not qualify live VoiceOver or the separate [native Home issue](2026-11-16-signed-voiceover.md). Fresh-account installation, minimum-supported-OS coverage and final-release acceptance remain open.
