import { spawnSync } from "node:child_process";
import electron from "electron";
const files = process.argv.slice(2);
const selection = files.length
  ? files
  : [
      "src",
      "tests/integration/store.test.ts",
      "tests/integration/workspace.test.ts",
      "tests/integration/credentials.native.test.ts",
    ];
const result = spawnSync(electron, ["node_modules/vitest/vitest.mjs", "run", ...selection], {
  stdio: "inherit",
  env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
});
process.exit(result.status ?? 1);
