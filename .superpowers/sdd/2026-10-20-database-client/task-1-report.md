# Task 1 report

Status: implemented and locally verified on macOS arm64. Cross-platform CI is configured but has not run. No remote, release, signing identity, product name, or license was invented.

Base: `72173bc`. Branch: `build-desktop-client`. This checkout was used directly. No agents, reviewers, or worktrees were spawned.

## Delivered

- Pinned Electron 44.9.0, React 19.3.1, Vite 8.3.4, TypeScript 6.0.2, Tailwind 4.3.3, Playwright 1.64.1 and compatible dependencies.
- User-directed tooling change: Bun 1.4.2 with `bun.lock`, Oxlint 1.89.0, and Oxfmt 0.74.0. Removed the provisional pnpm lock/config and ESLint dependencies/config. Scripts and CI use Bun. Formatting covers source and documentation; execution workspace reports are intentionally excluded.
- Electron loads built local assets only, with explicit Node-disabled, context-isolated sandbox policy, restrictive CSP, denied navigation/windows/webviews/permissions/downloads. Preload exposes nothing unless sandbox and isolation are active.
- Typed Zod command/reply/event schemas, branded request identifiers, 64 KiB UTF-8 message limit, exact registered window/main-frame/URL validation, and sanitized fixed errors. Renderer API contains only `request`, `subscribe`, and `unsubscribe`; `app.info` is the sole command.
- Minimal shadcn-style Radix/CVA Button and Tailwind shell with connection search, sidebar, Overview tab, empty workspace, status, and light/dark/system appearance. Actual Electron screenshot inspected at `test-results/desktop-shell.png`.
- Unsigned packaging configuration, executable/header/assets verification, native packaged startup smoke, and four native CI entries covering macOS arm64/x64, Windows x64, Linux x64 AppImage/deb.
- README and repository AGENTS instructions. Approved plan/spec included with controller's Bun/Oxc update.

## RED evidence

An intentionally insecure but runnable local Electron bootstrap was built first. Running `pnpm test:e2e tests/e2e/security.spec.ts` then produced three intended assertion failures, after correcting an initial test-harness issue:

```text
renderer cannot access Node: Expected "undefined", Received "function"
untrusted sender rejected: Expected UNTRUSTED_SENDER, Received HANDLER_MISSING
malformed command rejected: Expected VALIDATION_ERROR, Received BRIDGE_MISSING
3 failed
```

The application booted successfully; these failures concerned missing bridge/window protections rather than a boot error. RED output was captured in `/tmp/dbapp-task1-red.log`. This preceded the user's Bun/Oxc steering. The unsafe bootstrap is absent from the final tree.

During GREEN, global sandbox enforcement correctly prevented a test attacker from using renderer `require`. The fixture was corrected to use its own sandboxed test preload, exposing a raw IPC call only inside the attacker window. There is no production test bypass.

## GREEN evidence

Host: macOS 27.2.0, Apple Silicon arm64; Node 20.20.2 and Bun 1.4.2.

| Command | Result |
| --- | --- |
| `bun install --frozen-lockfile` | Passed, no lockfile changes |
| `bun run typecheck` | Passed |
| `bun run lint` | Passed, Oxlint with warnings denied |
| `bun run format:check` | Passed, includes approved docs |
| `bun run test` | 2/2 unit boundary tests passed |
| `bun run build` | Passed, Vite renderer and bundled Electron main/preload |
| `bun run test:e2e` | 7/7 actual Electron tests passed in 4.1s |
| `bun run test:integration` | No tests yet, explicitly exits successfully as a placeholder |
| `bun run package` | Passed, unsigned arm64 and x64 DMGs built |
| `bun run verify:package release/mac-arm64/dbapp.app arm64` | Executable/header/assets/IPC/renderer smoke passed |
| `bun run verify:package release/mac/dbapp.app x64` | x64 header/assets passed; launch explicitly skipped on arm64 host |
| `git diff --check` | Passed |

Desktop tests cover Node/process isolation, untrusted real sender rejection, malformed preload commands, narrow exposed API, oversized messages, navigation/window denial, shell loading, and appearance controls. A separate test copies the actual build to a temporary directory and appends a raw IPC caller to its test-only preload, proving main-process validation rejects unknown fields and oversized inputs even when preload validation is bypassed. A valid control request succeeds first.

A negative package check extracted the final arm64 ASAR into a temporary directory, removed its referenced CSS, repacked it, and ran the real verifier against that broken package. It exited unsuccessfully with `Missing renderer asset`; the negative-check harness reported:

```text
PASS: verifier rejects a packaged application with a missing referenced stylesheet before launch.
```

Final packages were rebuilt after adding the runtime sandbox guard. Package outputs remain ignored in `release/`; no binaries are committed. Windows/Linux and Intel runtime behavior are not verified locally.

## Self-review

Critical: no outstanding finding in this milestone's scope. Main validates sender identity independently of preload. No arbitrary filesystem, shell, IPC channel, or credential capability is exposed.

Important fixes made during self-review:

- Require sandbox and context isolation before exposing the preload bridge so package smoke cannot succeed with those protections disabled.
- Normalize ASAR paths for Windows when verifying required assets.
- Keep native executable startup separate from inspection of a non-native architecture.
- Deny downloads and permissions in the dedicated application session, beyond the explicit navigation/window rules.
- Use test-only copied artifacts for direct main-handler validation, avoiding shipped test instrumentation.

Nice-to-have: a product icon remains the default Electron icon until naming/branding is decided. The shell is deliberately minimal. Development rebuilds and reopens the application rather than running a network dev server.

## Concerns and next boundaries

- CI has not run because there is no remote. All platform results remain pending except local macOS arm64 package smoke and both macOS asset/header inspections.
- macOS 13+ is the Electron 44 floor and is set in packaging. Windows/Linux OS floors and desktop coverage remain release qualification work.
- Code signing/notarization, installer fresh-install checks, licensing, and product naming remain external public-release gates.
- `test:integration --passWithNoTests` is a documented temporary placeholder and must be removed when Task 3 introduces database integration tests.
- The 64 KiB limit is for control commands. Later database/document transports require explicit, separate bounded contracts.
- Bun reports one blocked transitive package postinstall. Electron and esbuild alone are trusted. Local macOS build/package succeeded; Windows NSIS packaging still requires native CI evidence.

## Official references used

- Electron stable releases: https://releases.electronjs.org/release?channel=stable
- Electron security: https://www.electronjs.org/docs/latest/tutorial/security/
- Electron sandbox: https://www.electronjs.org/docs/latest/tutorial/sandbox
- Electron 44 release/OS floor: https://www.electronjs.org/blog/electron-44-0
- Vite Node requirements: https://vite.dev/guide/
- shadcn manual setup: https://ui.shadcn.com/docs/installation/manual
- electron-builder platform builds: https://www.electron.build/docs/features/multi-platform-build/
- Bun dependency lifecycle trust: https://bun.sh/docs/pm/cli/install
- Oxlint setup: https://oxc.rs/docs/guide/usage/linter/quickstart
- Oxfmt setup: https://oxc.rs/docs/guide/usage/formatter/quickstart
