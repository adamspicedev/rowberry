/** Exactly 100,000 string scalars, at least 10 MiB UTF-8; generated to avoid a 10 MiB repository blob. */
export function largeJsonFixture(): string {
  return (
    "[" +
    Array.from({ length: 100_000 }, (_, i) =>
      JSON.stringify(`${i}:needle:${"x".repeat(100)}`),
    ).join(",") +
    "]"
  );
}
export function nestedJsonFixture(depth = 100): string {
  return "[".repeat(depth) + '"雪🙂"' + "]".repeat(depth);
}
