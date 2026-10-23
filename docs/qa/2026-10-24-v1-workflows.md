# V1-03 automated workflow baseline — 24 October 2026

Source: `db7f1d3c871da448ab3a599a267330728d30c506`. Host: macOS 27.2, arm64. Built with `bun run build` and launched from source through Electron/Playwright using temporary app profiles. This was not a signed installer or packaged release acceptance run.

## Results

- Build passed. The existing large Monaco bundle warning remains; no performance acceptance claim follows from the build.
- `bun run test:e2e`: 14 passed, 1 skipped (packaged native OS vault test). Covers connection metadata lifecycle, simulated unavailable-store handling, draft protection, stale connection attempts, invalid JSON recovery/discard, IPC/navigation security and keyboard-accessible appearance controls.
- Selected PostgreSQL 18 desktop workflows: 6 passed. Covers table filtering/sorting/paging and keyboard inspection, connection testing without workspace mutation, JSON sidebar inspection and draft preservation, SQL selection/cancellation/paging/recovery, guarded cell/JSON saves and conflicts, and schema menus/toast undo.

Reproduction command for the database subset, requiring the disposable PostgreSQL 18 fixture on localhost port 55418:

```sh
bun run test:e2e:postgres tests/e2e/connection-test.spec.ts tests/e2e/browse.spec.ts tests/e2e/schema-browser.spec.ts tests/e2e/json-viewer.spec.ts tests/e2e/query.spec.ts tests/e2e/save.spec.ts --grep 'connection test leaves|live schema navigation|schema tree,|JSON sidebar|PG18|PostgreSQL 18'
```

The existing fixture container `dbapp-task3-pg18-SG0IOW` was reused; no working database or existing app profile was selected. The subset creates/mutates disposable test schemas. PostgreSQL 14 and TLS-manifest-dependent suites were not run in this pass.

## Execution limitations

The initial sandboxed run failed to launch Electron. Running with desktop execution permission resolved that environmental failure. An initial database command using only a grep filter still loaded an unrelated suite requiring a missing fixture manifest; explicitly selecting the six files above resolved collection. Neither failure was classified as an application defect.

No product fix was justified by this passing automated baseline. Automated steps know which controls to use and do not establish discoverability. Native denied/locked Keychain behaviour, VoiceOver, participant observations, exact-package identity and installer qualification remain open. The simulated unavailable-store pass is not native denied-store acceptance.

Continue with the [uncoached session protocol](v1-usability-session.md). V1-03 remains in progress; signing is deferred, not waived for public distribution.
