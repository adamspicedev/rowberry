# Workspace read-retry persistence — 26 October 2026

The integrity audit found a recovery gap: edits made before the initial workspace read succeeded were merged with stored drafts on retry, but no save was scheduled for the merged state. If the user made no further edits before restarting, the new copies could be lost.

SQL entered while the read was unavailable could also displace previously stored SQL tabs. Those older tabs are now retained as detached, copy-only SQL drafts; the current editor keeps its own text. Identical copies are not duplicated.

A successful read now persists the merged live state when initial updates were pending. If persistence fails, the copies remain in memory and the existing save-retry guidance is shown. Retrying a write still never reloads older disk contents over live work.

## Validation

- The regression test fails against the preceding implementation.
- Five workspace tests pass, including successful persistence without another edit, failed persistence followed by retry, and module restart restoring the exact merged invalid/Unicode/large-number drafts and displaced SQL, while the live SQL editor remains unchanged.
- Both packaged recovery scenarios pass: detached-copy restart without executing SQL, and cancel/explicit durable discard.
- Typecheck and lint pass.

Unsigned Apple-silicon candidate built with this change on base `248affb687c41df399c2ca0f75a9586e950531e6`:

- DMG SHA-256: `4acc9cb12b25f564c1a75441861b173d2f97917e4ac639f9039744ee8e144a62`.
- `app.asar` SHA-256: `bd256815665f42ef6a4ad1ee2053d8629bf2d6a56d3922b5ac1c16a4d013f252`.

The read/save failure sequence uses a controlled renderer regression. The packaged checks exercise real restart/discard storage behavior; they do not simulate native disk failure or establish recovery before a save is acknowledged. Signing and final-candidate acceptance remain deferred/open as recorded in the evidence register.
