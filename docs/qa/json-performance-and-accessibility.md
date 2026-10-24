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
