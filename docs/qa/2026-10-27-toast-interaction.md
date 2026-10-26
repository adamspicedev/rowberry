# Notification interaction timing — 27 October 2026

A notification previously used one pause flag for both hover and keyboard focus. Leaving either interaction restarted its seven-second dismissal timer even while the other interaction continued. A focused Undo button could therefore disappear underneath a keyboard user.

Hover and focus now pause expiry independently. Dismissal resumes only after both leave; moving focus between controls inside the same notification continues to preserve it. Existing persistent error notifications and explicit dismissal behavior are unchanged.

The packaged schema-browser regression failed against the old archive because Undo disappeared while focused after pointer departure. An earlier attempt stalled at the existing column-expansion step before reaching the regression; its cause was not established and it is not counted as passing. The rebuilt unsigned arm64 package passed the complete scenario in 7.4 seconds, verifying:

- Pointer departure while Undo retains focus does not dismiss it after eight seconds.
- Focus departure while Undo remains hovered does not dismiss it after eight seconds.
- Enter activates Undo and restores the hidden table.
- Once both hover and focus leave a notification, automatic dismissal resumes.
- Existing schema menus, SQL generation, appearance checks and independent database row-count verification still pass.

Playwright's renderer clock advances the expiry interval; no real eight-second waiting loops are needed. This verifies packaged focus, pointer and timer behavior, not native VoiceOver speech. Typecheck, lint, formatting and diff checks pass.

Candidate built on source base `d8d18aada8054c3cc9db9a4fa39668975713de7c` with the accompanying notification fix:

- DMG SHA-256: `f2fb663336fd1f8b4bd5c63cde0020a5a1a21f94b861993d07330dfd7b4f0eb8`.
- `app.asar` SHA-256: `4a1bf2e06164e62a8b313b98db5bf9f04ed442f5ddd14b143950792e15fcaa2c`.

Signing and broader human usability acceptance remain pending.
