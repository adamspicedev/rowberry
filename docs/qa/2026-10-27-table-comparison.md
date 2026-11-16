# Table comparison reliability — 27 October 2026

A delayed **Compare current database rows** reply could reopen a comparison after the user discarded drafts and changed the filter. The old reply also set the editing block on the new page.

The regression uses a real PostgreSQL exclusive table lock to hold the comparison request, observes that request waiting, changes the filter, then releases the lock. The old 0.1.1 package reproduced stale comparison results on the new page. Comparisons now carry a request version: discarding drafts, starting a save or requesting another comparison invalidates earlier replies. Unmount protection remains in place.

The test runs within the existing guarded save workflow on PostgreSQL 14 and 18. The first validation run passed PG14 but the PG18 lock observer reused a statistics snapshot inside its transaction. The observer now explicitly clears that snapshot before checking activity; no arbitrary delays or retries were added.

The local 0.1.2 Apple-silicon package retains the checked-in DMG background byte-for-byte and mounts as **Rowberry 0.1.2**.

- DMG SHA-256: `94abbf3ad2b2542ce72fb57d91d67eec5670e9aaa6f4bd75f2cffb43210b3cf5`.
- `app.asar` SHA-256: `8ddb80f93c57bff7b6df8df9ac860b857810daf1f92eb2ab825df2bec5aef04c`.

This is an unsigned development candidate. Local packaged checks and CI are separate evidence; this does not qualify a signed public release or replace unfamiliar-user testing.
