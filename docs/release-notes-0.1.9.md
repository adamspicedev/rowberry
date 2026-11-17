# Rowberry 0.1.9 development notes

macOS Apple-silicon development candidate. All 30 signed-package tests passed with no skips, alongside app/installer signing, notarization, stapling and Gatekeeper checks. Version 0.1.9 is the latest locally verified candidate; 0.1.8 remains privately retained. See the [qualification record](qa/2026-11-17-recovery-save-warning.md#signed-candidate-qualification).

- Keep the recovery warning and **Retry saving workspace** control visible when a newer draft cannot be saved, even if an older save finishes afterward.
- Preserve the latest live text and clear the warning after a corrected draft saves successfully. Supported recovery limits and the existing save delay are unchanged.

This repair concerns local draft recovery, not database writes. Keep the window open and copy important work elsewhere whenever recovery reports an error. Fresh-account installation, native VoiceOver Home navigation and final-release acceptance remain open.
