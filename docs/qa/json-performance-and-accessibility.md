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

## Sustained cleanup qualification

Set `DBAPP_MEMORY_SOAK_MINUTES` alongside `DBAPP_MEMORY_QUALIFICATION=1` to keep the inspector open/expand/close cleanup loop running for a specified duration. It accepts whole minutes from 0 to 120; zero retains the existing ten measured cycles. Ordinary CI does not enable a soak. Example for a one-hour packaged PostgreSQL 18 run:

```sh
DBAPP_MEMORY_QUALIFICATION=1 DBAPP_MEMORY_SOAK_MINUTES=60 \
DBAPP_PACKAGE_EXECUTABLE="$PWD/release/mac-arm64/Rowberry.app/Contents/MacOS/Rowberry" \
PLAYWRIGHT_JSON_OUTPUT_NAME=/tmp/rowberry-soak.json \
bunx playwright test --config playwright.postgres.config.ts tests/e2e/json.spec.ts \
  --grep PG18 --reporter=json
```

Each cycle verifies worker release, collects Chromium garbage, and enforces the existing 16 MiB retained-heap and 100-node growth limits. Samples include elapsed time. Measurement attachments are saved on assertion failure as well as success so a failed soak is not reduced to its last console line. A one-minute smoke test passed 195 cycles while developing this runner.

This extends the duration of the specific repeated-cleanup scenario. It does not establish peak process memory or typical-use memory without forced garbage collection, and does not qualify every workspace operation or lower-spec hardware.

### One-hour packaged result — 26 October 2026

The PostgreSQL 18 packaged scenario passed a full hour: **6,365 open/expand/close cycles**, including the initial baseline cycle. [All retained samples](2026-10-26-json-soak.json) cover 3,600,138 ms. Maximum retained renderer heap growth was **5,574,304 bytes (5.32 MiB)**, below 16 MiB; maximum DOM growth was zero. Every cycle verified worker release. The runner completed with one pass, no retries and no failures.

The unsigned Apple-silicon candidate's `app.asar` SHA-256 is `8009de1a208c5523a6a907e2403021d657b49a6466889d78cae53edb0c9c57f5`; application source matches `a54843c6d1cbbc6ac38269ee3a50a682f7ca6cb7`. This qualifies the sustained cleanup workload only; the broader memory and hardware gates remain open.

## Process-memory qualification without forced collection

Set `DBAPP_PROCESS_MEMORY_QUALIFICATION=1` to measure the packaged application's processes during 30 open/expand/close cycles of the 100,000-value document. Run it separately from `DBAPP_MEMORY_QUALIFICATION`; combining them fails before launching the app so forced collection cannot contaminate this result. Ordinary CI does not enable either qualification flag.

```sh
DBAPP_PROCESS_MEMORY_QUALIFICATION=1 DBAPP_PERFORMANCE_BUDGETS=1 \
DBAPP_PACKAGE_EXECUTABLE="$PWD/release/mac-arm64/Rowberry.app/Contents/MacOS/Rowberry" \
PLAYWRIGHT_JSON_OUTPUT_NAME=/tmp/rowberry-process-memory.json \
bunx playwright test --config playwright.postgres.config.ts tests/e2e/json.spec.ts \
  --grep PG --repeat-each=3 --reporter=json
```

Each repetition records a closed baseline, then expanded and closed samples for every cycle. [Electron's process metrics](https://www.electronjs.org/docs/latest/api/structures/memory-info) report working-set and per-process lifetime peak values in KiB. The attachment retains process identity and type, including main, renderer, GPU and utility processes returned by Electron. Missing positive main/renderer/utility measurements fail the check. JSON workers must also terminate after every close.

A **1.5 GiB sum of sampled process working sets** is the reference-machine regression ceiling, enforced only with `DBAPP_PERFORMANCE_BUDGETS=1`. Without that flag the run records measurements, not budget acceptance. Calibration observed a 1,080 MiB maximum with regular natural-collection drops; 1.5 GiB provides roughly 42% headroom for runtime variation while catching substantial growth in this bounded workload. It is not a supported-machine RAM requirement. The sum can count shared pages more than once and excludes database/test-driver processes; it is not Activity Monitor's memory-pressure measurement. Samples can miss transient peaks, and individual process lifetime peaks may precede the measured loop or occur at different times. They must not be added together and described as a simultaneous application peak.

Attachments survive assertion failures. No explicit garbage collection is invoked in this mode. This provides bounded normal-collection evidence, not hours of typical user work, exact peak physical footprint, or qualification on lower-spec Macs.

### Packaged process-memory result — 27 October 2026

Six packaged scenarios passed (three repetitions each on PostgreSQL 14 and 18), with **180 cycles and 366 process snapshots**. The maximum sampled sum was **1,193.84 MiB**, below the calibrated 1.5 GiB ceiling. Each cycle verified worker release; normal garbage collection was allowed throughout. [All measurements and prior attempts](2026-10-27-json-process-memory.json) are retained. Typecheck, lint and formatting also passed.

Reference hardware: Apple M4, 32 GiB RAM, macOS 27.2 (26B118), arm64. Application source matches `308a481b07d37ab4e9a6eefdea03d61d18283c31`; the unchanged unsigned package archive SHA-256 is `8009de1a208c5523a6a907e2403021d657b49a6466889d78cae53edb0c9c57f5`.

The initial 1 GiB calibration produced five budget failures shortly after the loop began and one timeout waiting for the initial JSON inspection button, before memory measurement. The timeout's cause was not established; it is not counted as passing. A subsequent measurement-only 30-cycle diagnostic showed regular natural-collection drops, with closed totals between about 890 and 1,065 MiB and a 1,080 MiB overall sampled maximum. This informed the 1.5 GiB reference ceiling before the fresh six-scenario qualification. The diagnostic was not budget acceptance, and the original failures remain recorded. No application memory fix is claimed.

This closes the bounded sampled-process measurement task. Exact transient peaks, hours-long typical use and lower-spec hardware remain open.
