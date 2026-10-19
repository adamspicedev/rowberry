# JSON acceptance fixtures

`generate.ts` builds deterministic fixtures without committing a large data blob:

- `largeJsonFixture()`: 11,588,891 UTF-8 bytes, 100,000 searchable string scalars.
- `nestedJsonFixture()`: 100 array levels around a Unicode string; accepts an explicit depth for limit tests.

Precision, escaped/hostile/empty keys, duplicate decoded keys, invalid grammar, exact source ranges and exact/over-limit UTF-8 fixtures live next to the model tests so their assertions remain readable.

Run the real WebWorker acceptance benchmark with `bun scripts/benchmark-json.ts`.
