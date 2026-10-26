# Rowberry 0.1.1 candidate

Unsigned macOS Apple-silicon development build. This version identifies the current local QA build; it is not a signed public release.

- Fix focus after closing inactive workspace tabs and keyboard navigation out of context menus.
- Keep notifications available while either keyboard focus or pointer hover remains inside them.
- Improve recovery-limit guidance and preserve drafts when retrying failed recovery reads.
- Include the recent JSON accessibility and memory-qualification work.

The installer is named `Rowberry-0.1.1-mac-arm64.dmg`; its mounted Finder window is titled **Rowberry 0.1.1**. The app displays **v0.1.1** in its status area. Future version changes update the installer filename, mounted title and app status from `package.json`.

The application stays named **Rowberry.app** so replacing the installed copy follows the existing manual-upgrade workflow. See [data storage](data-storage.md) before upgrading. Signing, unfamiliar-user acceptance and final-release qualification remain pending.
