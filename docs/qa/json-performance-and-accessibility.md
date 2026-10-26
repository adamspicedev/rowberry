# JSON performance and accessibility qualification

Working local performance budgets established 24 October 2026 for the existing approximately 12 MB / 100,000-scalar fixture. Reference host: Apple M4, 32 GiB RAM, macOS 27.2 arm64. These are development qualification limits, not promises for every supported Mac or final release acceptance.

| Operation                     | Local limit |
| ----------------------------- | ----------- |
| Expand a large JSON container | 100 ms      |
| Select a visible tree row     | 100 ms      |
| Worker parse                  | 1,000 ms    |
| Worker search                 | 250 ms      |
| Cancel worker search or parse | 100 ms each |

Run the `json.spec.ts` UI and worker scenarios with `DBAPP_PERFORMANCE_BUDGETS=1`. Set `DBAPP_PACKAGE_EXECUTABLE` to the candidate executable for packaged qualification; use disposable PostgreSQL fixtures. Run three consecutive repetitions, retaining each test's JSON measurement attachments. All repetitions must pass; investigate a failure before retrying and do not report only the fastest run. General CI leaves the flag unset to avoid treating varying runner hardware as the reference machine.

The 100 ms interaction goal already existed in the measured UI tests. The worker limits allow headroom over existing local baselines while identifying substantial regressions. These limits must be revisited on a lower-spec supported Mac before broad performance claims. Memory/high-water and sustained-session budgets remain open; bounded DOM rows are not proof of bounded total memory.

## Automated accessibility checks

The JSON tree exposes its active row with `aria-activedescendant`, retaining that row in the DOM if manually scrolled out of view. Rendered rows stay below 40 for the 100,000-value fixture. Home/End select the first/last visible-tree entry; Right Arrow expands or enters a child; Left Arrow collapses or selects the parent. These behaviours are checked in the desktop regression suite alongside existing search/reveal behaviour.

Automated ARIA and keyboard assertions do not establish VoiceOver acceptance. Manual screen-reader testing and unfamiliar-user sessions remain open.

## Local packaged result — 24 October 2026

All six tests passed across three consecutive repetitions with budgets enabled. [Retained measurements](2026-10-24-json-performance.json) record each repetition: expansion 14.3–14.9 ms, selection 5.7–10.6 ms, worker parse 212.2–215.4 ms, search 11.5–11.8 ms, and cancellation 5.5–8.4 ms. PostgreSQL 18 supplied the disposable UI fixture.

Unsigned Apple-silicon package built from the JSON tree changes accompanying this record, based on `aef304dd03493ae3c201c65528f9d969ceeb032c`:

- DMG SHA-256: `f9ccc1b9f00876cba4563202f6f1292966d40b6cab78996966deca94e91d70c5`
- app.asar SHA-256: `465c3ece22f3b963033b231da03126a6bf7b73d3e7fdd13dfeeaad565b0d914a`

The initial six-test pass was followed by this retained run because the default console reporter did not persist successful measurement attachments. To retain future qualification data, use `--reporter=json` with `PLAYWRIGHT_JSON_OUTPUT_NAME` pointing to the report file.

## Focus and cleanup follow-up

Pointer selection now focuses the tree without scrolling it, including after a disclosure-button click. Disclosure labels identify Expand versus Collapse. Explicit sibling positions and counts describe the full expanded/filter-visible tree rather than only the rendered window; the 100,000th array entry is identified as item 100,000 of 100,000. Filtered results use the filtered sibling set.

Set `DBAPP_MEMORY_QUALIFICATION=1` for the optional JSON inspector cleanup scenario in `json.spec.ts`. After a warm-up cycle it opens, expands and closes the 100,000-value document ten times. Each cycle must create one JSON worker and release it on close. After explicit Chromium garbage collection, retained renderer heap must stay within 16 MiB of the warm baseline and DOM growth below 100 nodes. These initial regression limits allow runtime/cache variation while catching retained document-sized allocations or repeated detached trees.

This is a retained-resource test, not an OS memory ceiling: renderer heap excludes worker heaps, GPU/native allocations and other processes. Explicit garbage collection does not represent ordinary user timing. Peak memory, longer sessions and lower-spec Macs remain unqualified.

### Packaged cleanup result — 24 October 2026

[All retained measurements](2026-10-24-json-cleanup.json) passed across three consecutive packaged repetitions (30 measured cleanup cycles plus three warm-ups). Every JSON worker closed, DOM counts stayed at 495 after collection, and the maximum heap increase from each warm baseline was under 1.54 MiB. Expansion stayed below 18 ms and worker parsing below 181 ms. This records bounded local cleanup, not general memory or sustained-session acceptance.

Unsigned package built from the focus changes accompanying this record, based on `2c77614eb491741d14b53f964cea3eef667fe6cb`:

- DMG SHA-256: `9b3ff78442030247ad43d3db4901fd7160747d1303afea14e8da5b881757f9f6`
- app.asar SHA-256: `651b8707a3ccf9125d45e25a7fc295aafa7cd80907d8533be6512d79e8ad74bc`

## Pending human check

Use the matching unsigned package with a disposable connection. Turn on VoiceOver and inspect a nested JSON value. Record the package hash and spoken output rather than marking this passed from automated ARIA assertions.

1. Click a tree row, then use Up/Down without clicking elsewhere. Confirm navigation continues from that row and the selection is announced.
2. Click a disclosure control, then use Right/Left to enter a child or return to its parent. Confirm the spoken expanded/collapsed state matches the display.
3. Use Home/End in a large array. Confirm the spoken position and sibling count reflect the full array. Scroll the active row offscreen, then navigate again.
4. Filter to a nested match, clear the filter, and close the inspector using the keyboard. Record any lost focus, missing announcements or unexpected jumps.

This check remains pending until a person reports the actual result; it does not require Apple signing or access to production data.

## Packaged follow-up — 26 October 2026

The rebuilt Apple-silicon candidate passed all nine tests across three consecutive repetitions with performance, memory and large-scalar qualification enabled. [Every retained measurement](2026-10-26-json-qualification.json) includes PostgreSQL 14 and 18 scenarios, six warm-up cycles and 60 measured cleanup cycles.

- Large-tree expansion: 21.3–34.4 ms; ordinary selection: 6.1–11.3 ms.
- Selection with a 10,000,000-byte string: 2.6–13 ms across 60 samples. This path now enforces the same 100 ms local interaction budget when `DBAPP_PERFORMANCE_BUDGETS=1`; previously it only recorded timings.
- Maximum renderer heap growth after collection: 1,116,752 bytes above its warm baseline, within the 16 MiB limit. Maximum DOM growth: four nodes, within the 100-node limit. Each worker was released on close.
- Candidate `app.asar`: `c8e2a90d4c51c6a1ec5e6000cf7bf493cb48752e34fd4570760c066155321f9f`; application source is unchanged from merged commit `4a97c9a6692044a9c5db1b081f59783ef05620a6`.

An initial attempt had six connection failures because OrbStack and both fixtures were stopped; its three standalone worker checks passed. Both existing fixtures were started and verified ready before the complete nine-test rerun. These failures were environmental and are recorded in the retained evidence.

The [native VoiceOver harness](native-voiceover-harness.md#automatic-announcement-fix-26-october-2026) also verified automatic expansion/collapse speech on this candidate. Large-array position announcements and the remaining human tasks above are still open. These short repeated-use checks do not establish peak process memory, hours-long stability or lower-spec Mac performance.
