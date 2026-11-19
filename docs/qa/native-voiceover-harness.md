# Native VoiceOver qualification

This opt-in harness reads **actual VoiceOver output** through the installed macOS VoiceOver AppleScript dictionary (`content of last phrase`). DOM assertions supplement that evidence; they never substitute for speech. It does not record audio or assess pronunciation, timing comfort, overall usability, or every announcement in the speech queue.

## Setup

Use an unlocked local Mac with a known packaged Rowberry build and the disposable PostgreSQL 18 fixture on `127.0.0.1:55418` (database/user `fixture`, fixture-only password). Current qualification can use the signed candidate; historical unsigned results below retain their original scope. The harness creates a uniquely named schema and a temporary application profile. It stages a change, cancels the preview, verifies the database is unchanged, and drops only its own schema. It does not use saved personal connections or Keychain secrets.

1. Turn VoiceOver on and use English speech/UI for the current phrase matchers.
2. In VoiceOver Utility → General, enable **Allow VoiceOver to be controlled with AppleScript**.
3. Allow the executing host (Terminal, Codex, or ChatGPT as listed by macOS) to control VoiceOver and System Events under macOS Privacy & Security → Automation. Grant that host native keyboard access under **Device Control and Data Access** on macOS 27 (called **Accessibility** on earlier versions). The host for this session was listed as ChatGPT. If macOS still denies `osascript` keystrokes, restart the approved host or run from an approved Terminal; do not reset TCC or weaken system protection.
4. Keep Quick Nav off so ordinary arrow keys reach the app. Leave the desktop idle while the harness runs; focus loss aborts capture. The harness leaves VoiceOver and your preferences unchanged.

```sh
bun run verify:voiceover --check
DBAPP_VOICEOVER=1 bun run verify:voiceover
# Separate qualification of explicitly requested state readback:
DBAPP_VOICEOVER=1 bun run verify:voiceover --readback
# Also qualify navigation and spoken positions in a virtualized 100,000-item array:
DBAPP_VOICEOVER=1 DBAPP_PACKAGE_EXECUTABLE="$PWD/release-signed/0.1.4/mac-arm64/Rowberry.app/Contents/MacOS/Rowberry" bun run verify:voiceover --large-array
```

The default executable is `release/mac-arm64/Rowberry.app/Contents/MacOS/Rowberry`. Override it with `DBAPP_PACKAGE_EXECUTABLE` for another packaged candidate. `--check` verifies VoiceOver is running and its last-phrase interface is readable; it does not prove native keystroke permission. A live run verifies that separately.

## Evidence and failure behavior

The runner prints a temporary evidence directory containing a JSON report and a screenshot per completed step (or failed UI step). The report records the exact `app.asar` SHA-256, observed phrases, and pass/fail state. Copy this directory to the candidate's durable QA evidence storage before temporary files are removed. The isolated profile is removed on normal completion/failure; the evidence remains. Abrupt process termination can leave the uniquely named fixture schema/profile for manual cleanup.

The capture polls while native input is in flight, then waits for both the action and matching speech to succeed. Each scenario verifies its final selection, expansion or dialog state and DOM focus **after** that point; application foreground focus is checked before and after the verification. Matching speech cannot hide an action failure or a delayed focus jump to another control. It requires output to change after the action starts before accepting expected words. Pre-existing matching output, missing speech, scripting denial and lost application focus fail. The tests reject the duplicate/scalar Expand labels reported during manual testing. Native arrow/Escape events are guarded by the test app's foreground process ID. The script never speaks expected phrases to manufacture a result and does not use the clipboard.

Each step also retains an `input` diagnostic with separate native Electron and renderer layers. It observes `before-input-event`, window/webContents focus changes, DOM navigation key capture/bubble phases, `defaultPrevented`, and focus transitions. Start/end snapshots distinguish application focus from the active DOM element. The recorder does not handle or cancel input. Each layer keeps at most 64 events and reports how many were dropped; an unavailable layer is reported without discarding the other one. Listeners are removed during cleanup.

Tracing starts only after the disposable fixture is set up and is enabled only during a step. It records navigation keys and element tag/role/ID/ARIA label, never printable keystrokes, element values or text content. This helper is for isolated test profiles, not personal sessions. Electron/DOM modifier fields are not a complete account of native macOS event flags. The speech polling deadline is not a cancellation mechanism for arbitrary callbacks; native commands and UI actions must retain their own bounds.

The default mode requires automatic announcements. `--readback` explicitly asks VoiceOver to describe the current item (VO-F3) after expansion/collapse; it is **not evidence of automatic state-change announcements**. The report records `speechMode` so the results cannot be confused. Both modes enter the JSON table's VoiceOver interaction context. Preview cancellation uses VO-Tab followed by Escape to pass the key to Rowberry, because VoiceOver can consume Escape itself. Plain Escape with VoiceOver active is not qualified by this scenario.

Current scenarios: select/expand/collapse JSON items, select a scalar without a bogus Expand label, open a save preview with Cancel focused, Escape back to Preview changes, and independent verification that cancellation did not write the staged value. Because only the last phrase is exposed, rapidly superseded announcements can produce a failure requiring inspection; this is not a complete speech transcript.

`--large-array` adds a second disposable row containing 100,000 numeric array entries. Native keys select the first and last entries, return Home, and navigate after the active descendant has been scrolled out of view. Each position check requires fresh spoken ordinal/count evidence as well as the correct selected value, ARIA position/count, tree focus and fewer than 40 mounted rows. The report records `largeArrayItems`. Matchers tolerate grouping commas in numeric speech but reject a different ordinal or sibling count; they do not infer a spoken count from the DOM. The flag can combine with `--readback`, whose expansion/collapse limitations remain unchanged.

The [signed 0.1.4 run on 16 November](2026-11-16-signed-voiceover.md) captured the correct large-array positions but **failed native Home**, which moved focus to the panel's resize control. The opt-in run therefore remains failing on that candidate; preview checks after Home were not reached. The failure and diagnostic controls are retained. Browser-driven Home and native Home without VoiceOver passing do not close this gap.

CI runs transcript matching, freshness and final-focus verification tests, plus isolated Electron tests for event capture, filtering, bounds, disposal and partial evidence recovery. Those tests use Electron-injected input, not OS keyboard injection or VoiceOver speech. Native qualification is intentionally local and explicit: hosted CI has no configured VoiceOver desktop or macOS permissions.

## Initial validation — 26 October 2026

Four automated harness tests passed, covering freshness, normalization, forbidden repeated labels and focus loss. Native keyboard permission is now confirmed working after enabling ChatGPT under Device Control and Data Access.

The requested-readback run passed all six speech checks: selected array, expanded array, collapsed array, scalar label without bogus Expand wording, preview Cancel focus, and return to Preview changes after passed-through Escape. Independent database verification confirmed the original value remained unchanged. Typecheck and lint passed.

Candidate `app.asar` SHA-256: `bd2040762f06396a0f781acd196d5adaef9982500493a736a193f6d70e946f46`.

Local evidence: `/var/folders/2x/90kbbrpx6kj81dfc_53j6t_00000gn/T/rowberry-voiceover-V6QT6s/evidence`. This is temporary local evidence, not a published release artifact.

The default automatic-announcement run still failed at expansion: the UI expanded, but no fresh expanded-state phrase was captured. Explicit readback confirmed the state is exposed correctly. Automatic expansion/collapse speech remains **open**, and this readback pass does not replace that qualification or the broader manual accessibility checklist.

Apple documents [the caption panel as a view of VoiceOver speech](https://support.apple.com/guide/voiceover/unac078/mac). The scripting property names used here were verified against `/System/Library/CoreServices/VoiceOver.app/Contents/Resources/VoiceOver.sdef` on the test Mac.

Apple documents [current-item descriptions](https://support.apple.com/guide/voiceover/orientation-commands-cpvokys03/mac) and [passing the next key to an app](https://support.apple.com/en-ca/guide/voiceover/vo2722/mac).

## Automatic announcement fix — 26 October 2026

The JSON tree now emits a polite status message when the user expands or collapses a row. Native `aria-expanded` state remains present. Direct row focus and delaying input did not resolve the silence; improving speech capture alone also did not resolve it.

The new packaged candidate passed the default **automatic-announcements** run, without requesting a description: “items expanded” and “items collapsed”. All six speech checks passed, including scalar naming, preview focus and passed-through Escape. Independent database verification confirmed cancellation did not write the staged value. A preceding run correctly failed when the app lost foreground focus.

- `app.asar` SHA-256: `c8e2a90d4c51c6a1ec5e6000cf7bf493cb48752e34fd4570760c066155321f9f`.
- DMG SHA-256: `bd4217740c48872bf904e259203a1d6cb0b13d5d08da438e870a3537e16ec236`.
- Temporary native evidence: `/var/folders/2x/90kbbrpx6kj81dfc_53j6t_00000gn/T/rowberry-voiceover-Y2899F/evidence`.
- Packaged JSON workflows passed on PostgreSQL 14 and 18, plus the Chromium worker test. Observed large-tree expansion was 21–24 ms and selection 8–10 ms on this Mac.
- Six speech-capture tests cover freshness, normalization, forbidden labels, focus loss, speech during an unfinished action, and action failure despite matching speech.

This closes the specific automatic expansion/collapse gap for this candidate on the test Mac. It does not qualify every VoiceOver setting, every announcement in the queue, other screen readers, or plain Escape while VoiceOver consumes that key.

## Signed 0.1.10 Home comparison

On 20 November 2026, the 100,000-item fixture was tested twice on the signed arm64 app. With `--pass-home`, Control-Option-Tab followed by Home selected the root but left focus on Resize JSON panel, reproducing the plain Home focus failure. With `--parent-navigation`, three Left Arrow presses from the offscreen-navigation step selected the array, collapsed it, then selected the root. VoiceOver spoke “JSON root: object, 1 keys selected expanded outline row (1 of 1)” and the JSON tree retained focus. All 14 steps passed, including preview cancellation. These comparison flags each enable the large-array fixture. The default `--large-array` scenario continues to test plain Home.

The reports and screenshots are retained locally in `release-signed/0.1.10/voiceover/pass-home` and `release-signed/0.1.10/voiceover/parent-navigation`.
