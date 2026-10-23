import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyPaths, changedPaths } from "./ci-scope.mjs";
import { assertRequiredResults } from "./ci-gate.mjs";

for (const [name, paths, expected] of [
  [
    "website source and wiki",
    ["apps/web/src/routes/index.tsx", "apps/web/wiki/sql.md", "apps/web/bun.lock", ".vercelignore"],
    { desktop: false, website: true },
  ],
  [
    "website evidence and metadata",
    ["docs/qa/website/evidence.json", "README.md", ".gitignore", ".oxfmtrc.json"],
    { desktop: false, website: false },
  ],
  [
    "desktop source and dependencies",
    ["src/main/index.ts", "bun.lock", "package.json"],
    { desktop: true, website: false },
  ],
  [
    "desktop tooling",
    ["scripts/build.mjs", "tests/e2e/workspace.spec.ts", "electron-builder.yml"],
    { desktop: true, website: false },
  ],
  [
    "mixed change",
    ["src/renderer/main.tsx", "apps/web/wiki/index.md"],
    { desktop: true, website: true },
  ],
  ["CI wiring", [".github/workflows/checks.yml"], { desktop: true, website: true }],
  [
    "unknown shared configuration",
    [".npmrc", "new-runtime.config.ts"],
    { desktop: true, website: true },
  ],
]) {
  test(name, () => assert.deepEqual(classifyPaths(paths), expected));
}

test("PR scope includes the whole branch and both sides of renames", () => {
  const paths = changedPaths(
    "pull_request",
    { pull_request: { base: { sha: "base" }, head: { sha: "head" } } },
    (args) => {
      assert.deepEqual(args, ["diff", "--name-only", "--no-renames", "-z", "base...head", "--"]);
      return "src/old.ts\0apps/web/new.ts\0";
    },
  );
  assert.deepEqual(classifyPaths(paths), { desktop: true, website: true });
});
test("push uses the full pushed range", () => {
  changedPaths("push", { before: "before", after: "after" }, (args) => {
    assert.ok(args.includes("before..after"));
    return "";
  });
});
test("manual runs and new branches require everything; diff failures propagate", () => {
  assert.equal(changedPaths("workflow_dispatch", {}), null);
  assert.equal(changedPaths("push", { before: "000000" }), null);
  assert.throws(() =>
    changedPaths("push", { before: "a", after: "b" }, () => {
      throw new Error("missing history");
    }),
  );
});
function results(desktop, website) {
  return {
    scope: { result: "success", outputs: { desktop: String(desktop), website: String(website) } },
    format: { result: "success" },
    ...Object.fromEntries(
      ["checks", "postgres", "compatibility", "package"].map((name) => [
        name,
        { result: desktop ? "success" : "skipped" },
      ]),
    ),
    website: { result: website ? "success" : "skipped" },
  };
}
test("gate accepts only successful required suites and intentionally skipped unrelated suites", () => {
  for (const [desktop, website] of [
    [true, false],
    [false, true],
    [true, true],
    [false, false],
  ]) {
    assert.doesNotThrow(() => assertRequiredResults(results(desktop, website)));
  }
});
test("gate fails closed for failed, cancelled, skipped, missing or invalid required results", () => {
  for (const name of [
    "scope",
    "format",
    "checks",
    "postgres",
    "compatibility",
    "package",
    "website",
  ]) {
    for (const result of ["failure", "cancelled", "skipped", undefined]) {
      const report = results(true, true);
      report[name].result = result;
      assert.throws(() => assertRequiredResults(report));
    }
  }
  const report = results(false, true);
  delete report.scope.outputs.website;
  assert.throws(() => assertRequiredResults(report));
});
