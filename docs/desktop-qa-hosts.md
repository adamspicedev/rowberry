# Desktop QA hosts

Use disposable test accounts on x64 Windows and Linux desktops to qualify Rowberry's current package targets. A physical machine or an x64 VM is suitable; record virtualization in the evidence. ARM guests on Apple Silicon do not establish native x64 support. Keep the interactive session available during desktop tests.

## Windows

Install the official desktop app, sign in, open the cloned Rowberry project, and enable Computer Use for UI inspection. To operate it from the Mac, configure remote access on the Windows host in Settings > Connections, then add it under Control other devices on the Mac where that feature is available. Keep the Windows session unlocked and dedicate that desktop to the test while foreground automation runs. Follow [OpenAI's current remote connection instructions](https://learn.chatgpt.com/docs/remote-connections) if labels change.

Run Rowberry and the tests in native Windows/PowerShell so they exercise Windows Credential Manager. WSL tests do not qualify the Windows desktop package. Install Git, the repository-pinned Bun version, a compatible Node version, and Docker with Linux containers for PostgreSQL fixtures. Clone the repository and run `bun install --frozen-lockfile`. OpenSSL must be on PATH for fixture certificate generation. Set `DBAPP_DOCKER_CONTEXT` to the host's actual Docker context.

## Linux

Use an x64 desktop with a logged-in graphical session and unlocked Secret Service, such as Ubuntu 24.04 with GNOME Keyring. Install the same repository tools, Docker, OpenSSL and Electron's system dependencies. Run tests as the desktop user so they can access that user's D-Bus session and keyring. An SSH shell without those session services does not qualify native credentials.

For remote coding and test commands, enable SSH, install/authenticate Codex on the host, add a concrete host alias to the Mac's `~/.ssh/config`, confirm `ssh <alias>` works, then enable it in Settings > Connections > SSH and select the cloned repository. See [SSH host setup](https://learn.chatgpt.com/docs/remote-connections).

The [official Linux desktop preview](https://learn.chatgpt.com/docs/linux/linux-app), checked 21 October 2026, supports Ubuntu 24.04/26.04, Debian 13 and other listed distributions, but does not yet include Computer Use. SSH provides filesystem and shell access, not automatic access to desktop pixels. Visual inspection therefore needs a local tester or a separately supported desktop-control integration. Xvfb smoke tests remain supplementary to real desktop installer and credential checks.

## First qualification session

Record OS/version, CPU architecture and desktop session, then run the native credential procedure in [supported platforms](supported-platforms.md). Exercise the packaged installer, remember a disposable password, restart and connect, test recovery/explicit discard, delete the saved connection, and verify the credential is removed. Run the [upgrade gate](upgrade-baselines.md) once an accepted baseline exists. Store the exact package digests and results under `docs/qa/`.

Use separate accounts for locked/unavailable-store tests so the operator's everyday credential store is not disrupted. Keep fixture manifests separate from other work and clean up the labelled disposable containers after each session.
