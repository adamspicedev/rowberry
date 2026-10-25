# Native VoiceOver qualification

This opt-in harness reads **actual VoiceOver output** through the installed macOS VoiceOver AppleScript dictionary (`content of last phrase`). DOM assertions supplement that evidence; they never substitute for speech. It does not record audio or assess pronunciation, timing comfort, overall usability, or every announcement in the speech queue.

## Setup

Use an unlocked local Mac with the unsigned packaged Rowberry build and the disposable PostgreSQL 18 fixture on `127.0.0.1:55418` (database/user `fixture`, fixture-only password). The harness creates a uniquely named schema and a temporary application profile. It stages a change, cancels the preview, verifies the database is unchanged, and drops only its own schema. It does not use saved personal connections or Keychain secrets.

1. Turn VoiceOver on and use English speech/UI for the current phrase matchers.
2. In VoiceOver Utility → General, enable **Allow VoiceOver to be controlled with AppleScript**.
3. Allow the executing host (Terminal or Codex) to control VoiceOver and System Events under macOS Privacy & Security → Automation. Grant that host Accessibility access for native keystrokes. If macOS still denies `osascript` keystrokes, restart the approved host or run from an approved Terminal; do not reset TCC or weaken system protection.
4. Keep Quick Nav off so ordinary arrow keys reach the app. Leave the desktop idle while the harness runs; focus loss aborts capture. The harness leaves VoiceOver and your preferences unchanged.

```sh
bun run verify:voiceover --check
DBAPP_VOICEOVER=1 bun run verify:voiceover
```

The default executable is `release/mac-arm64/Rowberry.app/Contents/MacOS/Rowberry`. Override it with `DBAPP_PACKAGE_EXECUTABLE` for another packaged candidate. `--check` verifies VoiceOver is running and its last-phrase interface is readable; it does not prove native keystroke permission. A live run verifies that separately.

## Evidence and failure behavior

The runner prints a temporary evidence directory containing a JSON report and a screenshot per completed step (or failed UI step). The report records the exact `app.asar` SHA-256, observed phrases, and pass/fail state. Copy this directory to the candidate's durable QA evidence storage before temporary files are removed. The isolated profile is removed on normal completion/failure; the evidence remains. Abrupt process termination can leave the uniquely named fixture schema/profile for manual cleanup.

The capture requires output to change after the action before accepting expected words. Pre-existing matching output, missing speech, scripting denial and lost application focus fail. The tests reject the duplicate/scalar Expand labels reported during manual testing. Native arrow/Escape events are guarded by the test app's foreground process ID. The script never speaks expected phrases to manufacture a result and does not use the clipboard.

Current scenarios: select/expand/collapse JSON items, select a scalar without a bogus Expand label, open a save preview with Cancel focused, Escape back to Preview changes, and independent verification that cancellation did not write the staged value. Because only the last phrase is exposed, rapidly superseded announcements can produce a failure requiring inspection; this is not a complete speech transcript.

CI runs the transcript matcher/freshness tests. Native qualification is intentionally local and explicit: hosted CI has no configured VoiceOver desktop or macOS permissions.

## Initial validation — 26 October 2026

Four automated harness tests passed, covering freshness, normalization, forbidden repeated labels and focus loss. Native preflight succeeded. The live run captured: “items: array, 2 items selected collapsed outline row (2 of 2) JSON inspector region”. Subsequent native navigation was blocked by macOS: `osascript is not allowed to send keystrokes (1002)`, including after the maintainer reported enabling permission. The harness correctly failed; expansion and modal speech qualification are **not passed**. A fresh live run from a correctly approved host remains required.

Apple documents [the caption panel as a view of VoiceOver speech](https://support.apple.com/guide/voiceover/unac078/mac). The scripting property names used here were verified against `/System/Library/CoreServices/VoiceOver.app/Contents/Resources/VoiceOver.sdef` on the test Mac.
