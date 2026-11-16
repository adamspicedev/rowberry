# Roadmap to v1

Our first release has one goal: make everyday PostgreSQL and JSON work dependable on an Apple silicon Mac.

Rowberry will remain free, open source and local, without a required account. V1 focuses on connecting securely, browsing tables, running SQL, editing eligible values, recovering work and updating without losing your workspace.

!!! note "A plan, not a release announcement"
Rowberry is still in early development. No qualified public release is available yet, and these milestones have no promised dates. See [Get started](getting-started.md) to evaluate the app from source with a disposable database.

## Now: qualify the signed preview

Local Apple-silicon candidates now have Developer ID signatures and Apple notarization. Recorded development checks include signed 0.1.3 package and saved-credential upgrade/restart tests, real denied Keychain reads and saves, and bounded performance checks on signed 0.1.4. These results do not establish a public release.

Version 0.1.5 fixes the JSON discard confirmation's keyboard navigation: focus starts on **Keep editing JSON**, Tab stays in the prompt, and cancelling preserves the draft and returns focus. Its source change passed CI, and the exact signed candidate passed all 27 packaged tests with no skips. App/installer notarization and Gatekeeper checks passed. Results and remaining limits are recorded in the [evidence register](https://github.com/adamspicedev/rowberry/blob/main/docs/qa/v1-evidence-register.md).

The [0.1.6 query-confirmation repair](https://github.com/adamspicedev/rowberry/blob/main/docs/qa/2026-11-16-query-confirmation-keyboard.md) keeps keyboard focus in the unfinished-result warning, preserves the draft and results when cancelled, and offers **Reopen session** after connection loss. Ending a result does not run the pending SQL. Source query and JSON workflows passed on PostgreSQL 14 and 18, and the exact signed candidate passed all 27 packaged tests with no skips. App and installer signing, notarization, Gatekeeper and embedded branding checks also passed.

The next work is qualification of the installation and real-user experience:

- Make connecting, finding data and saving JSON understandable without coaching.
- Verify native Keychain behaviour, including unavailable credential storage.
- Check interrupted drafts, conflicts and uncertain save outcomes so the app never gives a misleading success message.
- Audit cancellation, connection switching and large-data behaviour.
- Decide whether result export is essential for the first release based on actual user tasks.

Unfamiliar preview participants are not yet available, so observed task completion and the result-export decision remain pending while focused reliability work continues. Locked or unavailable Keychain storage, denied credential deletion, minimum supported macOS testing and final-release qualification also remain open.

VoiceOver testing found a remaining issue: Home can move focus from the JSON tree to its resize control. Other recorded speech checks passed, but a complete native screen-reader run is still required after that issue is resolved.

## Next: retain and distribute an accepted preview

A preview must be installable through the normal macOS download and installation process. Local signing, Gatekeeper and automated persistence checks have passed; downloaded-package and fresh-account installation acceptance still need to be completed.

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
