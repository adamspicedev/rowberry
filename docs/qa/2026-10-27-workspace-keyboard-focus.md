# Workspace keyboard focus — 27 October 2026

Two packaged regressions reproduced before the fix:

- Closing an inactive document with its close button focused removed that button and left focus outside the selected tab. Closing an inactive tab now restores focus to the selected tab without changing the active document. Restoration runs after the tab count changes, before paint; ordinary SQL edits do not trigger it.
- Tab and Shift+Tab inside a context menu were intercepted like Escape, leaving focus on the trigger. They now close the menu and allow native sequential navigation from the trigger. Escape still returns directly to it.

The rebuilt unsigned arm64 package passed all three complete workflow scenarios in 22.5 seconds: SQL workflows on PostgreSQL 14 and 18, and the PG18 schema/menu scenario. These verify:

- Left/Right tab switching, wraparound, Home and End, with focus on the selected tab and edited table values preserved.
- Cancellation of a dirty-tab close retains its close-button focus and draft.
- Closing an active table focuses its adjacent tab; closing inactive tables focuses the still-selected SQL tab; closing the final SQL tab focuses New SQL tab.
- Context-menu Escape returns to the trigger. Tab moves to the next control and Shift+Tab to the preceding control.
- Closing the structure dialog by its button or Escape returns focus to the originating table. Keyboard menu activation opens the dialog.
- Existing query execution, cancellation, recovery, notification timing and independent database assertions still pass.

Typecheck, lint, formatting and diff checks passed. These are packaged Chromium keyboard/focus checks, not native VoiceOver speech or an exhaustive accessibility audit.

Candidate built on source base `afde4558fe49001982b5a2b574cbe2a94fdf49c5` with the accompanying focus fixes:

- DMG SHA-256: `f97c127833372b972597fa687d365ba4b06f93b1d7a5bbd04cb8cd9da9c08f52`.
- `app.asar` SHA-256: `8c66f80f3694df83ad3d9482261921fb482cf1b93e248296fb18496253f2f384`.
