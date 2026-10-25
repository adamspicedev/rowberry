# Native VoiceOver qualification

This opt-in harness reads **actual VoiceOver output** through the installed macOS VoiceOver AppleScript dictionary (`content of last phrase`). DOM assertions supplement that evidence; they never substitute for speech. It does not record audio or assess pronunciation, timing comfort, overall usability, or every announcement in the speech queue.

## Setup

Use an unlocked local Mac with the unsigned packaged Rowberry build and the disposable PostgreSQL 18 fixture on `127.0.0.1:55418` (database/user `fixture`, fixture-only password). The harness creates a uniquely named schema and a temporary application profile. It stages a change, cancels the preview, verifies the database is unchanged, and drops only its own schema. It does not use saved personal connections or Keychain secrets.

1. Turn VoiceOver on and use English speech/UI for the current phrase matchers.
2. In VoiceOver Utility → General, enable **Allow VoiceOver to be controlled with AppleScript**.
3. Allow the executing host (Terminal, Codex, or ChatGPT as listed by macOS) to control VoiceOver and System Events under macOS Privacy & Security → Automation. Grant that host native keyboard access under **Device Control and Data Access** on macOS 27 (called **Accessibility** on earlier versions). The host for this session was listed as ChatGPT. If macOS still denies `osascript` keystrokes, restart the approved host or run from an approved Terminal; do not reset TCC or weaken system protection.
4. Keep Quick Nav off so ordinary arrow keys reach the app. Leave the desktop idle while the harness runs; focus loss aborts capture. The harness leaves VoiceOver and your preferences unchanged.

```sh
bun run verify:voiceover --check
DBAPP_VOICEOVER=1 bun run verify:voiceover
# Separate qualification of explicitly requested state readback:
DBAPP_VOICEOVER=1 bun run verify:voiceover --readback
```

The default executable is `release/mac-arm64/Rowberry.app/Contents/MacOS/Rowberry`. Override it with `DBAPP_PACKAGE_EXECUTABLE` for another packaged candidate. `--check` verifies VoiceOver is running and its last-phrase interface is readable; it does not prove native keystroke permission. A live run verifies that separately.

## Evidence and failure behavior

The runner prints a temporary evidence directory containing a JSON report and a screenshot per completed step (or failed UI step). The report records the exact `app.asar` SHA-256, observed phrases, and pass/fail state. Copy this directory to the candidate's durable QA evidence storage before temporary files are removed. The isolated profile is removed on normal completion/failure; the evidence remains. Abrupt process termination can leave the uniquely named fixture schema/profile for manual cleanup.

The capture requires output to change after the action before accepting expected words. Pre-existing matching output, missing speech, scripting denial and lost application focus fail. The tests reject the duplicate/scalar Expand labels reported during manual testing. Native arrow/Escape events are guarded by the test app's foreground process ID. The script never speaks expected phrases to manufacture a result and does not use the clipboard.

The default mode requires automatic announcements. `--readback` explicitly asks VoiceOver to describe the current item (VO-F3) after expansion/collapse; it is **not evidence of automatic state-change announcements**. The report records `speechMode` so the results cannot be confused. Both modes enter the JSON table's VoiceOver interaction context. Preview cancellation uses VO-Tab followed by Escape to pass the key to Rowberry, because VoiceOver can consume Escape itself. Plain Escape with VoiceOver active is not qualified by this scenario.

Current scenarios: select/expand/collapse JSON items, select a scalar without a bogus Expand label, open a save preview with Cancel focused, Escape back to Preview changes, and independent verification that cancellation did not write the staged value. Because only the last phrase is exposed, rapidly superseded announcements can produce a failure requiring inspection; this is not a complete speech transcript.

CI runs the transcript matcher/freshness tests. Native qualification is intentionally local and explicit: hosted CI has no configured VoiceOver desktop or macOS permissions.

## Initial validation — 26 October 2026

Four automated harness tests passed, covering freshness, normalization, forbidden repeated labels and focus loss. Native keyboard permission is now confirmed working after enabling ChatGPT under Device Control and Data Access.

The requested-readback run passed all six speech checks: selected array, expanded array, collapsed array, scalar label without bogus Expand wording, preview Cancel focus, and return to Preview changes after passed-through Escape. Independent database verification confirmed the original value remained unchanged. Typecheck and lint passed.

Candidate `app.asar` SHA-256: `bd2040762f06396a0f781acd196d5adaef9982500493a736a193f6d70e946f46`.

Local evidence: `/var/folders/2x/90kbbrpx6kj81dfc_53j6t_00000gn/T/rowberry-voiceover-V6QT6s/evidence`. This is temporary local evidence, not a published release artifact.

The default automatic-announcement run still failed at expansion: the UI expanded, but no fresh expanded-state phrase was captured. Explicit readback confirmed the state is exposed correctly. Automatic expansion/collapse speech remains **open**, and this readback pass does not replace that qualification or the broader manual accessibility checklist.

Apple documents [the caption panel as a view of VoiceOver speech](https://support.apple.com/guide/voiceover/unac078/mac). The scripting property names used here were verified against `/System/Library/CoreServices/VoiceOver.app/Contents/Resources/VoiceOver.sdef` on the test Mac.

Apple documents [current-item descriptions](https://support.apple.com/guide/voiceover/orientation-commands-cpvokys03/mac) and [passing the next key to an app](https://support.apple.com/en-ca/guide/voiceover/vo2722/mac).
