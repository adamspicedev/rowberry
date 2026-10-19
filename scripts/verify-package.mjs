import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { listPackage, extractFile } from "@electron/asar";
const [packagePath, architecture = process.arch] = process.argv.slice(2);
if (!packagePath)
  throw new Error(
    "Usage: bun run verify:package <unpacked application directory or .app> [arm64|x64]",
  );
if (!["x64", "arm64"].includes(architecture)) throw new Error("Unsupported architecture");
const root = path.resolve(packagePath);
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
const entries = listPackage(archive).map((entry) => entry.replaceAll("\\", "/"));
for (const entry of [
  "/dist/main/index.cjs",
  "/dist/database/index.cjs",
  "/dist/preload/index.cjs",
  "/dist/renderer/index.html",
])
  if (!entries.includes(entry)) throw new Error(`Missing packaged asset: ${entry}`);
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
await new Promise((resolve, reject) => {
  const child = spawn(executable, ["--smoke-test"], {
    env: { ...process.env, ELECTRON_ENABLE_LOGGING: "1" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  const timer = setTimeout(() => {
    child.kill();
    reject(new Error("Packaged smoke timed out"));
  }, 25000);
  child.stdout.on("data", (chunk) => {
    output += chunk;
  });
  child.stderr.on("data", () => {});
  child.on("error", (error) => {
    clearTimeout(timer);
    reject(error);
  });
  child.on("exit", (code) => {
    clearTimeout(timer);
    if (code === 0 && output.includes("DBAPP_SMOKE_OK")) resolve();
    else reject(new Error(`Packaged smoke failed (exit ${code}): ${output}`));
  });
});
console.log(
  `Verified executable, ${architecture} architecture, renderer assets, IPC and sandboxed renderer smoke.`,
);
