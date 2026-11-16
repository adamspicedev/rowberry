# Keychain approval timing — 16 November 2026

The connection supervisor previously started its 15-second timer before resolving credentials. A real Electron utility-process regression delayed credential resolution for 16 seconds and reproduced the timeout in 15.61 seconds. The same test passes after moving the timer to the start of database worker creation.

The supervisor now emits `awaiting-credentials`, then `connecting`, then `connected`. The renderer announces **Waiting for Keychain access…**, disables duplicate Connect actions and retains Disconnect. Generation checks still reject late results after cancellation or switching. The OS owns its permission dialog; cancelling a Rowberry request does not dismiss that dialog.

Validation before the signed build:

- All 22 connection integration tests passed in 19.24 seconds, including delayed credential resolution, switching, immediate cancellation while credentials are pending, worker crashes, verified TLS, and a stalled authentication socket.
- All five desktop session workflows passed in 8.2 seconds. The waiting-label/live-region and control-state check injects the credential-phase event; lifecycle timing is tested separately through the real supervisor. These checks do not automate a macOS permission dialog.
- Typecheck, lint, formatting and diff checks passed.

The candidate version is 0.1.3. Signed artifact verification and upgrade results are recorded on the associated PR after the build completes. This change does not establish final release acceptance or configure remote signing credentials.
