import fs from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { spawn, spawnSync } from "node:child_process";
import { listPackage, extractFile } from "@electron/asar";
const [packagePath, architecture = process.arch] = process.argv.slice(2);
const defaultPath =
  process.platform === "darwin"
    ? `release/${process.arch === "arm64" ? "mac-arm64" : "mac"}/Rowberry.app`
    : process.platform === "win32"
      ? "release/win-unpacked"
      : "release/linux-unpacked";
if (!["x64", "arm64"].includes(architecture)) throw new Error("Unsupported architecture");
const root = path.resolve(packagePath ?? defaultPath);
const executable =
  process.platform === "darwin"
    ? path.join(root, "Contents/MacOS/Rowberry")
    : path.join(root, process.platform === "win32" ? "Rowberry.exe" : "rowberry");
const resources = path.join(
  root,
  process.platform === "darwin" ? "Contents/Resources" : "resources",
);
const binary = await fs.readFile(executable);
function checkArchitecture() {
  if (process.platform === "darwin") {
    if (binary.readUInt32LE(0) !== 0xfeedfacf)
      throw new Error("Expected a 64-bit Mach-O executable");
    if (binary.readUInt32LE(4) !== (architecture === "arm64" ? 0x100000c : 0x1000007))
      throw new Error("Wrong Mach-O architecture");
  } else if (process.platform === "linux") {
    if (
      binary.subarray(0, 4).toString("hex") !== "7f454c46" ||
      binary[4] !== 2 ||
      binary.readUInt16LE(18) !== (architecture === "arm64" ? 183 : 62)
    )
      throw new Error("Wrong ELF architecture");
  } else {
    if (
      binary.subarray(0, 2).toString() !== "MZ" ||
      binary.readUInt32LE(binary.readUInt32LE(0x3c)) !== 0x4550 ||
      binary.readUInt16LE(binary.readUInt32LE(0x3c) + 4) !==
        (architecture === "arm64" ? 0xaa64 : 0x8664)
    )
      throw new Error("Wrong PE architecture");
  }
}
checkArchitecture();
const archive = path.join(resources, "app.asar");
const entries = listPackage(archive, { isPack: false }).map((entry) => entry.replaceAll("\\", "/"));
for (const entry of [
  "/LICENSE",
  "/dist/renderer/Baloo2-OFL.txt",
  "/dist/main/index.cjs",
  "/dist/database/index.cjs",
  "/dist/preload/index.cjs",
  "/dist/renderer/index.html",
])
  if (!entries.includes(entry)) throw new Error(`Missing packaged asset: ${entry}`);
for (const prefix of ["worker-", "editor.worker-"]) {
  if (
    !entries.some(
      (entry) => entry.startsWith(`/dist/renderer/assets/${prefix}`) && entry.endsWith(".js"),
    )
  )
    throw new Error(`Missing packaged worker asset: ${prefix}`);
}
const main = extractFile(archive, "dist/main/index.cjs").toString();
if (/nodeIntegration(?:InWorker|InSubFrames)?\s*:\s*true/.test(main))
  throw new Error("Enabled packaged renderer Node integration");
const html = extractFile(archive, "dist/renderer/index.html").toString();
if (!html.includes("Content-Security-Policy")) throw new Error("Missing packaged CSP");
for (const match of html.matchAll(/(?:src|href)="\.\/([^"]+)"/g)) {
  const asset = match[1];
  if (!asset || !entries.includes(`/dist/renderer/${asset}`))
    throw new Error(`Missing renderer asset: ${asset}`);
}
if (architecture !== process.arch) {
  console.log(
    `Assets and ${architecture} executable verified; launch skipped on ${process.arch} host.`,
  );
  process.exit(0);
}
const profile = await fs.mkdtemp(path.join(tmpdir(), "rowberry-package-"));
try {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(executable, ["--smoke-test", `--user-data-dir=${profile}`], {
      env: { ...process.env, ELECTRON_ENABLE_LOGGING: "1" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    let diagnostics = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`Packaged smoke timed out: ${output} ${diagnostics}`));
    }, 25000);
    child.stdout.on("data", (chunk) => {
      output = (output + chunk).slice(-16000);
    });
    child.stderr.on("data", (chunk) => {
      diagnostics = (diagnostics + chunk).slice(-16000);
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("exit", (code) => {
      clearTimeout(timer);
      if (code === 0 && output.includes("DBAPP_SMOKE_OK")) resolve();
      else reject(new Error(`Packaged smoke failed (exit ${code}): ${output} ${diagnostics}`));
    });
  });
} finally {
  await fs.rm(profile, { recursive: true, force: true });
}
if (!process.argv.includes("--assets-only")) {
  const result = spawnSync(
    "bun",
    ["x", "--no-install", "playwright", "test", "--config", "playwright.package.config.ts"],
    { stdio: "inherit", env: { ...process.env, DBAPP_PACKAGE_EXECUTABLE: executable } },
  );
  if (result.status !== 0) throw new Error("Packaged production workflow tests failed");
}
console.log(
  `Verified executable, ${architecture} architecture, renderer assets, IPC and sandboxed renderer smoke.`,
);
