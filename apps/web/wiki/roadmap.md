# Roadmap to v1

Our first release has one goal: make everyday PostgreSQL and JSON work dependable on an Apple silicon Mac.

Rowberry will remain free, open source and local, without a required account. V1 focuses on connecting securely, browsing tables, running SQL, editing eligible values, recovering work and updating without losing your workspace.

!!! note "A plan, not a release announcement"
Rowberry is still in early development. No qualified public release is available yet, and these milestones have no promised dates. See [Get started](getting-started.md) to evaluate the app from source with a disposable database.

## Now: prepare for a signed preview

The release scope, acceptance tasks and evidence register are defined. The next work is signing and notarization, alongside testing the current interface with people unfamiliar with Rowberry.

- Make connecting, finding data and saving JSON understandable without coaching.
- Verify native Keychain behaviour, including unavailable credential storage.
- Check interrupted drafts, conflicts and uncertain save outcomes so the app never gives a misleading success message.
- Audit cancellation, connection switching and large-data behaviour.
- Decide whether result export is essential for the first release based on actual user tasks.

Existing implementation and automated checks are a starting point. These workflows still need acceptance evidence on the packages we intend to distribute.

## Next: qualify a signed preview

A preview must be installable through the normal macOS download and installation process. We will test the exact signed and notarized package, including first launch, credentials, persistence and recovery.

We will retain accepted packages and checksums so later versions can be tested against a known baseline. A successful build alone does not qualify a release.

## Then: use it, fix it, release v1

Preview users will complete real tasks. We will address observed failures and check keyboard access, VoiceOver, light and dark themes, and smaller windows.

Before v1, we will qualify the final package, verify upgrades from an accepted baseline, and finish download, setup, manual-update and troubleshooting guidance. Release notes, checksums, corresponding source and license notices will accompany the app.

Publication follows an explicit release review. A quiet feedback period is not a substitute for completed tests.

## Platform plan

| Platform                       | V1 plan                                                    |
| ------------------------------ | ---------------------------------------------------------- |
| macOS on Apple silicon (arm64) | The only v1 release target; qualification is still pending |
| macOS on Intel                 | Deferred until native testing resources are available      |
| Windows and Linux              | Deferred                                                   |

Intel, Windows and Linux desktop build checks are paused while we focus on Apple silicon. There are no dates for adding these platforms. PostgreSQL remains the only database engine planned for v1; see [project status](status.md) for current test coverage and limits.

## Later, or subject to evidence

Result export is an open scope decision, not a promised feature. Additional database engines, bulk import, multi-statement SQL scripts, editable arbitrary query results, visual schema administration, automatic updates and cloud collaboration are outside the current v1 plan.

We will revisit priorities when a concrete user task shows what is missing. The immediate priority is a trustworthy core workflow.

## Follow along

This page summarises the release direction. The repository's [v1 to-do list](https://github.com/adamspicedev/rowberry/blob/main/docs/v1-todo.md) tracks individual tasks and evidence, while the [release checklist](https://github.com/adamspicedev/rowberry/blob/main/docs/release-checklist.md) defines publication requirements.

To help, [report a specific workflow problem](https://github.com/adamspicedev/rowberry/issues) with reproduction steps and sanitised diagnostics. Never include passwords or private database contents.
