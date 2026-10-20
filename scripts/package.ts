import { spawnSync } from "node:child_process";
// Local packages are always unsigned. The protected signing workflow invokes
// electron-builder directly with externally supplied signing credentials.
const environment = { ...process.env, CSC_IDENTITY_AUTO_DISCOVERY: "false" };
Reflect.deleteProperty(environment, "CSC_LINK");
Reflect.deleteProperty(environment, "WIN_CSC_LINK");
const result = spawnSync(
  "bun",
  ["x", "--no-install", "electron-builder", "--publish", "never", ...process.argv.slice(2)],
  {
    stdio: "inherit",
    env: environment,
  },
);
process.exit(result.status ?? 1);
