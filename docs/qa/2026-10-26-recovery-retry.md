# Workspace read-retry persistence — 26 October 2026

The integrity audit found a recovery gap: edits made before the initial workspace read succeeded were merged with stored drafts on retry, but no save was scheduled for the merged state. If the user made no further edits before restarting, the new copies could be lost.

A successful read now persists the merged live state when initial updates were pending. If persistence fails, the copies remain in memory and the existing save-retry guidance is shown. Retrying a write still never reloads older disk contents over live work.

## Validation

- The regression test fails against the preceding implementation.
- Five workspace tests pass, including successful persistence without another edit, failed persistence followed by retry, and module restart restoring the exact merged invalid/Unicode/large-number drafts.
- Both packaged recovery scenarios pass: detached-copy restart without executing SQL, and cancel/explicit durable discard.
- Typecheck and lint pass.

Unsigned Apple-silicon candidate built with this change on base `248affb687c41df399c2ca0f75a9586e950531e6`:

- DMG SHA-256: `a7a02a9ebfefb70d8be5d2bfadcd700a4d84243b842f66f912000e3bbab03f1e`.
- `app.asar` SHA-256: `35c1278b482cae368c09e96190aa1bdcd773b61b040a9261936f23c7223bb96c`.

The read/save failure sequence uses a controlled renderer regression. The packaged checks exercise real restart/discard storage behavior; they do not simulate native disk failure or establish recovery before a save is acknowledged. Signing and final-candidate acceptance remain deferred/open as recorded in the evidence register.
