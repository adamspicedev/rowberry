import { spawnSync } from "node:child_process";
const files = process.argv.slice(2);
const built = spawnSync("bun", ["run", "build"], { stdio: "inherit", env: process.env });
if (built.status !== 0) process.exit(built.status ?? 1);
const result = spawnSync(
  "bun",
  [
    "scripts/test.mjs",
    // Files share disposable servers; lifecycle assertions count active backends.
    "--no-file-parallelism",
    ...(files.length ? files : ["tests/integration"]),
  ],
  { stdio: "inherit", env: process.env },
);
process.exit(result.status ?? 1);
