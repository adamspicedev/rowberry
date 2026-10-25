# Bounded JSON string preview — 26 October 2026

The JSON tree previously serialized an entire string before slicing its display to 160 characters. The preview now serializes at most 161 UTF-16 code units. One extra unit preserves surrogate pairs at the boundary. Only display work changes; source, copy, editing and database-save paths retain the complete value.

Unit coverage compares the displayed prefix with full serialization for a 10-million-character string, escapes, lone surrogates and pairs around the truncation boundary. An optional desktop scenario (`DBAPP_SCALAR_QUALIFICATION=1` in `json.spec.ts`) reads a 10-million-character scalar and measures ten alternating tree selections, attaching `json-large-scalar-selection`.

Local source Electron measurements were 5.6–11.4 ms before and 9.9–11.3 ms after, including two animation frames per sample. These samples do not establish a user-visible latency improvement; they verify the large-value path remains responsive. A separate Bun helper-only experiment over 100 calls measured 76.7 ms for full serialization and 0.34 ms for the bounded helper. That is not a Chromium or end-to-end benchmark. The primary improvement is eliminating serialization work and temporary output proportional to the complete scalar on every render.

Typecheck, lint and 59 unit tests passed (one skipped), as did the source PG18 JSON workflow and optional scalar scenario. Full-process memory and sustained-session acceptance remain open.
