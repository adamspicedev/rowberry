# Contributing to Rowberry

Thanks for helping make PostgreSQL work a little clearer. Code, documentation, reproducible bug reports, and testing on real desktops all help. Please follow our [Code of Conduct](CODE_OF_CONDUCT.md).

## Before you start

For code changes, open an issue or join an existing one before starting. Describe the problem, proposed approach, and scope; wait for maintainer agreement and assignment before opening a pull request. This avoids duplicate work and large changes that do not fit the project. Small documentation-only corrections can go straight to a PR.

For feature requests, explain the workflow you want to improve, who needs it, and any alternatives you have tried. For bugs, include:

- Rowberry version or commit, operating system, and CPU architecture.
- PostgreSQL version, if relevant.
- Minimal reproduction steps, expected behaviour, and actual behaviour.
- Sanitized logs or screenshots and, where useful, a small synthetic schema or JSON sample.

Remove passwords, connection strings, customer data, and private SQL from reports. For suspected vulnerabilities, follow the private reporting guidance in [Security](docs/security.md), rather than opening a public issue with exploit details.

## Set up development

Use Bun **1.4.2** and Node.js **22.12+**. A graphical desktop is required to run Electron. Fork and clone the repository using its hosting page, then run these commands from the checkout:

```sh
bun install --frozen-lockfile
bun run dev
```

`dev` builds the application and opens Electron using local assets. Close and rerun after source changes. Dependencies are pinned in `package.json` and `bun.lock`; keep both consistent when changing dependencies.

Create a focused branch from the repository's default branch, unless a maintainer specifies another base. Use a descriptive name such as `fix/json-search` or `docs/getting-started`. Never include `codex` in a branch name.

## Find your way around

| Path            | Responsibility                                                          |
| --------------- | ----------------------------------------------------------------------- |
| `src/renderer/` | React interface, editors, and workspace state.                          |
| `src/preload/`  | Restricted bridge exposed to the renderer.                              |
| `src/shared/`   | Validated messages, shared schemas, and contracts.                      |
| `src/main/`     | Desktop lifecycle, credentials, local storage, and worker coordination. |
| `src/database/` | PostgreSQL connections, queries, browsing, and writes.                  |
| `src/json/`     | JSON documents, paths, search, and worker operations.                   |
| `tests/`        | Integration fixtures and Electron end-to-end checks.                    |
| `docs/`         | Security, recovery, platform, and release documentation.                |

## Make the change

Keep each PR to one problem. Reuse existing UI components and shared contracts, and keep formatting changes out of unrelated files. Use TypeScript, Oxlint, and Oxfmt as configured in this repository.

Preserve the boundaries that protect database access: renderer code must not gain direct filesystem, credential-store, or database access. Validate bridge inputs and outputs, retain payload limits, and keep stale-session checks. Never automatically retry a mutation whose outcome is unknown. See [Security](docs/security.md) before changing those paths.

Update documentation in the same PR whenever user-visible behaviour, setup, storage, or security changes. Include before/after screenshots for visual changes, using synthetic data. There is no separate documentation repository to update.

AI-assisted contributions are welcome, but you are responsible for understanding the change, checking its claims, and validating its behaviour. Do not submit generated tests that merely restate the implementation.

## Validate your work

For code changes, run the baseline checks used by the checks workflow:

```sh
bun run typecheck
bun run lint
bun run format:check
bun run test
bun run build
bun run test:e2e
```

Use `bun run test`, not `bun test`: the wrapper runs Vitest under Electron's runtime. `bun run format` applies formatting across the repository; review its diff before committing. For a focused test, pass its path, for example:

```sh
bun run test src/shared/protocol.test.ts
```

Choose additional checks for the behaviour you change:

| Change                                          | Additional evidence                                                                                     |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| PostgreSQL connections, TLS, queries, or writes | Live integration tests and relevant PostgreSQL desktop tests.                                           |
| JSON editing or recovery                        | Focused regression tests for value preservation, conflicts, and restoration as applicable.              |
| UI behaviour                                    | Relevant Electron tests and a manual check of the changed workflow.                                     |
| Packaging or native credentials                 | Host-specific package verification and desktop credential checks.                                       |
| Documentation only                              | Verify commands, links, and rendered Markdown; app tests are unnecessary unless behaviour also changes. |

Test observable behaviour and failure cases. A regression test should fail without the fix; avoid duplicated assertions and tests coupled to private implementation details.

### Live PostgreSQL tests

Install Docker and OpenSSL. The fixture script defaults to the `orbstack` Docker context; set `DBAPP_DOCKER_CONTEXT=default` in your shell when using standard Docker. Then:

```sh
bun run test:postgres:setup
bun run test:integration
bun run test:e2e:postgres
bun run test:postgres:cleanup
```

Run cleanup even if a suite fails. Setup creates disposable PostgreSQL 14 and 18 containers with TLS certificates and localhost ports 55414 and 55418. Tests require their fixture manifest and fail when it is missing. Never substitute a production database or personal application profile. See the [development reference](docs/development.md#live-postgresql-checks) for fixture paths, overrides, and coverage.

### Packages and platform checks

Use the [packaging reference](docs/development.md#package-and-verify) and [release checklist](docs/release-checklist.md). Local packages are unsigned development artifacts. A successful build on one host does not qualify the other operating systems or CPU architectures.

## Open a pull request

Target the repository's default branch unless the agreed issue specifies otherwise. In the description:

- Link the assigned issue and explain the concrete problem and resulting behaviour.
- Describe relevant design decisions and compatibility considerations.
- List the checks you actually ran, their results, and anything not verified.
- Link documentation changes and add screenshots for visual changes.

Separate local results from CI results and release qualification. Do not report a configured workflow as a passing run. Address review feedback and keep the PR focused; maintainers may request changes before merging.

## Community and licensing

Be patient with reviews and constructive in disagreements. Participation is covered by the [Code of Conduct](CODE_OF_CONDUCT.md), including its private reporting process.

Contributions belong under the project's [GPL-3.0-only license](LICENSE). Preserve third-party attribution and license notices when adding or updating assets or dependencies.
