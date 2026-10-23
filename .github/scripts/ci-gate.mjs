import { pathToFileURL } from "node:url";

export function assertRequiredResults(needs) {
  for (const name of ["scope", "format"]) {
    if (needs[name]?.result !== "success") throw new Error(`${name} did not pass`);
  }
  const { desktop, website } = needs.scope.outputs ?? {};
  if (![desktop, website].every((value) => value === "true" || value === "false")) {
    throw new Error("Missing or invalid scope outputs");
  }
  for (const [enabled, jobs] of [
    [desktop, ["checks", "postgres", "compatibility", "package"]],
    [website, ["website"]],
  ]) {
    for (const name of jobs) {
      const expected = enabled === "true" ? "success" : "skipped";
      if (needs[name]?.result !== expected) {
        throw new Error(
          `${name}: expected ${expected}, received ${needs[name]?.result ?? "missing"}`,
        );
      }
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  assertRequiredResults(JSON.parse(process.env.CI_RESULTS));
  console.log("All checks required for this change passed.");
}
