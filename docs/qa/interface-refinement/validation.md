# Local validation

Apple Silicon macOS, 23 October 2026.

- Typecheck, lint, formatting and diff whitespace checks passed.
- Rebuilt `release/design-refinement/mac-arm64/Rowberry.app`.
- Packaged connection tests: 5 passed, 1 skipped (native credential-store qualification).
- Packaged TLS connection and active-profile locking: 1 passed.
- Packaged recovery: 2 passed, including invalid JSON recovery and cancel/discard.
- Package architecture, renderer assets, IPC and sandboxed startup smoke passed.
- Rendered preview exercised real table tabs, SQL execution, JSON inspection, keyboard tab switching and reduced-motion preference with disposable profiles.
- ECC evidence checker passed. Screenshots were inspected locally; this is not a complete accessibility audit.

An old test expected the removed Database connected placeholder; it now checks the actual Database schemas region. Delete/save tests now open the secondary-action popover.

The application is an unsigned local build. CI, Intel runtime and real locked-Keychain qualification were not run in this pass. The installed application and existing manual QA fixture were preserved.
