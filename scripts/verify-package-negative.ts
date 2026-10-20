import { createPackage, extractAll } from "@electron/asar";
import { mkdtemp, rm, readdir, readFile, writeFile, rename } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
// Never mutate the original package. A synthetic unpacked copy is sufficient:
// verification must reject its missing worker before any launch is attempted.
const root = process.argv[2];
if (!root) throw new Error("Pass an unpacked application directory");
const temporary = await mkdtemp(path.join(tmpdir(), "rowberry-negative-"));
try {
  const resources = process.platform === "darwin" ? "Contents/Resources" : "resources";
  const executable =
    process.platform === "darwin"
      ? "Contents/MacOS/Rowberry"
      : process.platform === "win32"
        ? "Rowberry.exe"
        : "rowberry";
  const { mkdir, copyFile } = await import("node:fs/promises");
  await mkdir(path.dirname(path.join(temporary, executable)), { recursive: true });
  await copyFile(path.join(root, executable), path.join(temporary, executable));
  const contents = path.join(temporary, "source");
  extractAll(path.join(root, resources, "app.asar"), contents);
  const assets = path.join(contents, "dist/renderer/assets");
  const workers = (await readdir(assets)).filter((name) => name.startsWith("worker-"));
  const savedWorkers = await Promise.all(
    workers.map(async (name) => ({ name, bytes: await readFile(path.join(assets, name)) })),
  );
  for (const worker of savedWorkers) await rm(path.join(assets, worker.name));
  await mkdir(path.join(temporary, resources), { recursive: true });
  await createPackage(contents, path.join(temporary, resources, "app.asar"));
  const result = spawnSync("bun", ["scripts/verify-package.ts", temporary, process.arch], {
    encoding: "utf8",
  });
  if (result.status === 0 || !result.stderr.includes("Missing packaged worker asset: worker-"))
    throw new Error(`Negative check did not fail for the missing worker: ${result.stderr}`);
  console.log("Missing packaged JSON worker rejected before executable launch.");
  for (const worker of savedWorkers) await writeFile(path.join(assets, worker.name), worker.bytes);
  const mainPath = path.join(contents, "dist/main/index.cjs");
  const main = await readFile(mainPath, "utf8");
  if (!main.includes("nodeIntegration: false"))
    throw new Error("Node integration negative fixture did not match built main");
  await writeFile(mainPath, main.replace("nodeIntegration: false", "nodeIntegration: true"));
  await createPackage(contents, path.join(temporary, resources, "app.asar"));
  const unsafe = spawnSync("bun", ["scripts/verify-package.ts", temporary, process.arch], {
    encoding: "utf8",
  });
  if (unsafe.status === 0 || !unsafe.stderr.includes("Enabled packaged renderer Node integration"))
    throw new Error(`Unsafe renderer was not rejected: ${unsafe.stderr}`);
  console.log("Enabled renderer Node integration rejected before executable launch.");
  await rename(path.join(temporary, executable), path.join(temporary, executable) + ".missing");
  const missing = spawnSync("bun", ["scripts/verify-package.ts", temporary, process.arch], {
    encoding: "utf8",
  });
  if (missing.status === 0 || !missing.stderr.includes("ENOENT"))
    throw new Error(`Missing executable was not rejected: ${missing.stderr}`);
  console.log("Missing executable rejected.");
} finally {
  await rm(temporary, { recursive: true, force: true });
}
