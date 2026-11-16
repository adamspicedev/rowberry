# Deferred desktop QA hosts

V1 targets macOS Apple silicon only. Intel Mac, Windows and Linux desktop qualification and build checks are paused; no additional hosts are required for the current release scope. Use the [macOS installation guide](macos-installation.md) and [release checklist](release-checklist.md) for active qualification work.

The Windows/Linux instructions below are retained for a future scope change, not a claim that qualification is underway. Before using them, recheck platform dependencies, remote-access tooling and supported versions. Use disposable test accounts on x64 desktops. A physical machine or an x64 VM is suitable; record virtualization in the evidence. ARM guests on Apple silicon do not establish native x64 support. Keep the interactive session available during desktop tests.

## Future Windows setup

Install the official desktop app, sign in, open the cloned Rowberry project, and enable Computer Use for UI inspection. To operate it from the Mac, configure remote access on the Windows host in Settings > Connections, then add it under Control other devices on the Mac where that feature is available. Keep the Windows session unlocked and dedicate that desktop to the test while foreground automation runs. Follow [OpenAI's current remote connection instructions](https://learn.chatgpt.com/docs/remote-connections) if labels change.

Run Rowberry and the tests in native Windows/PowerShell so they exercise Windows Credential Manager. WSL tests do not qualify the Windows desktop package. Install Git, the repository-pinned Bun version, a compatible Node version, and Docker with Linux containers for PostgreSQL fixtures. Clone the repository and run `bun install --frozen-lockfile`. OpenSSL must be on PATH for fixture certificate generation. Set `DBAPP_DOCKER_CONTEXT` to the host's actual Docker context.

## Future Linux setup

Use an x64 desktop with a logged-in graphical session and unlocked Secret Service, such as Ubuntu 24.04 with GNOME Keyring. Install the same repository tools, Docker, OpenSSL and Electron's system dependencies. Run tests as the desktop user so they can access that user's D-Bus session and keyring. An SSH shell without those session services does not qualify native credentials.

For remote coding and test commands, enable SSH, install/authenticate Codex on the host, add a concrete host alias to the Mac's `~/.ssh/config`, confirm `ssh <alias>` works, then enable it in Settings > Connections > SSH and select the cloned repository. See [SSH host setup](https://learn.chatgpt.com/docs/remote-connections).

Check the [Linux desktop tooling documentation](https://learn.chatgpt.com/docs/linux/linux-app) for supported distributions and desktop-control capabilities when this work resumes. SSH provides filesystem and shell access, not automatic access to desktop pixels. Visual inspection therefore needs a local tester or a supported desktop-control integration. Xvfb smoke tests remain supplementary to real desktop installer and credential checks.

## When a platform returns to scope

First update the release contract and build/check configuration for the explicitly approved target. Record OS/version, CPU architecture and desktop session, then run the native credential procedure in [supported platforms](supported-platforms.md). Exercise the packaged installer, remember a disposable password, restart and connect, test recovery/explicit discard, delete the saved connection, and verify the credential is removed. Run the [upgrade gate](upgrade-baselines.md) once an accepted baseline exists. Store the exact package digests and results under `docs/qa/`.

Use separate accounts for locked/unavailable-store tests so the operator's everyday credential store is not disrupted. Keep fixture manifests separate from other work and clean up the labelled disposable containers after each session.
