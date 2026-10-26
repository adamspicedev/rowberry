# Versioned installer and keyboard CI synchronization — 27 October 2026

The local candidate is now 0.1.1. The rebuilt package reports `0.1.1` through Electron and displays `v0.1.1` in its status area. Mounting `Rowberry-0.1.1-mac-arm64.dmg` produces `/Volumes/Rowberry 0.1.1`; its embedded background matches the checked-in branding asset byte-for-byte. The application remains named Rowberry.app.

- DMG SHA-256: `7272d5e1b2467d8acfe54a43fb8428772a8ae2c4851631e0c0193d7ac80a5efe`.
- `app.asar` SHA-256: `ddf1edbd9665332abb86d4a72f7571724cf56fe14bc0ae14f895359cc406be2d`.

The [post-merge main CI run](https://github.com/adamspicedev/rowberry/actions/runs/40420082805) failed in the newly added keyboard sequence: the structure dialog was absent after Shift+F10, ArrowDown and Enter. The test sent these keys without waiting for the reopened menu's initial focus or the target menu item's focus. It now asserts those states, and waits for the preceding dialog to be removed before reopening. This addresses a synchronization gap without retries, fixed sleeps, weakened assertions or changes to application behavior.

The complete schema/menu/notification scenario passed three consecutive packaged repetitions in 17.9 seconds. Typecheck, lint, formatting and diff checks passed. The local result is separate from PR and post-merge CI results. This remains an unsigned Apple-silicon development build, not public-release acceptance.
