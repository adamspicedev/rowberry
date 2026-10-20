# Security

Rowberry loads local assets. Its renderer has no Node integration, uses context isolation and sandboxing, and cannot navigate, open windows, grant permissions or download files. Main validates the requesting frame, commands, bounds and replies. Database sockets and retrieved passwords stay outside the renderer. A user-entered password necessarily exists briefly in the form and is cleared after submission.

Verified TLS is the default. Disabling verification or encryption requires acknowledgement. Use a limited database role: arbitrary SQL can mutate data, and cancellation does not prove rollback. Unknown outcomes require inspection before retrying. JSON saves require a stable row identity, explicit preview and optimistic conflict checking. Read-only result sets cannot acquire write authority from displayed data.

Connection metadata, saved SQL and draft recovery remain on the local machine. They can contain sensitive database data. See [storage and recovery](data-storage.md). Password persistence uses the OS vault; no plaintext file fallback exists. An unavailable vault uses session-only memory. There is no telemetry or automatic updater.

Before distributing, review pinned dependency advisories, inspect the packaged CSP and sandbox checks, verify signatures and notarization, and run the production smoke suite. The large Monaco chunk warning concerns bundle size and startup cost; it does not justify weakening CSP or loading editor code remotely. Report vulnerabilities privately to the repository owner through the hosting provider's private vulnerability reporting if enabled. No support email or remote service is configured.
