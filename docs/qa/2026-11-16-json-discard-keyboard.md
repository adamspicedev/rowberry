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

These checks use browser-driven keyboard events. They do not qualify live VoiceOver speech or resolve the separate [native Home failure](2026-11-16-signed-voiceover.md).
