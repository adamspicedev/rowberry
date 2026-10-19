// Render the checked-in vector master locally with Electron; no network or fonts.
import { _electron as electron } from "@playwright/test";
import { mkdtemp, readFile, writeFile, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
const directory = await mkdtemp(path.join(tmpdir(), "rowberry-icons-"));
let application;
try {
  await writeFile(path.join(directory, "package.json"), '{"main":"main.cjs"}');
  await writeFile(
    path.join(directory, "main.cjs"),
    'const {app,BrowserWindow}=require("electron");app.whenReady().then(()=>{new BrowserWindow({width:1024,height:1024,show:false,webPreferences:{sandbox:true}}).loadURL("about:blank")});',
  );
  application = await electron.launch({ args: [directory] });
  const page = await application.firstWindow();
  const svg = await readFile("assets/branding/rowberry-app.svg", "utf8");
  await mkdir("assets/branding/icons", { recursive: true });
  const sizes = [16, 24, 32, 48, 64, 128, 256, 512, 1024];
  const images = new Map();
  for (const size of sizes) {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(
      `<style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`,
    );
    const png = await page.screenshot({
      path: `assets/branding/icons/${size}.png`,
      omitBackground: true,
    });
    images.set(size, png);
  }
  // Windows ICO embeds the locally rendered PNG at each supported size.
  const icoSizes = sizes.filter((size) => size <= 256);
  const header = Buffer.alloc(6 + 16 * icoSizes.length);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(icoSizes.length, 4);
  let offset = header.length;
  for (const [index, size] of icoSizes.entries()) {
    const png = images.get(size);
    const entry = 6 + index * 16;
    header[entry] = size === 256 ? 0 : size;
    header[entry + 1] = header[entry];
    header.writeUInt16LE(1, entry + 4);
    header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(png.length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += png.length;
  }
  await writeFile(
    "assets/branding/rowberry.ico",
    Buffer.concat([header, ...icoSizes.map((size) => images.get(size))]),
  );
  // Modern macOS ICNS PNG representations, including a 1024px Retina master.
  const chunks = [
    [16, "icp4"],
    [32, "icp5"],
    [64, "icp6"],
    [128, "ic07"],
    [256, "ic08"],
    [512, "ic09"],
    [1024, "ic10"],
  ].map(([size, type]) => {
    const png = images.get(size);
    const chunk = Buffer.alloc(8);
    chunk.write(type, 0);
    chunk.writeUInt32BE(png.length + 8, 4);
    return Buffer.concat([chunk, png]);
  });
  const icnsHeader = Buffer.alloc(8);
  icnsHeader.write("icns", 0);
  icnsHeader.writeUInt32BE(8 + chunks.reduce((total, chunk) => total + chunk.length, 0), 4);
  await writeFile("assets/branding/rowberry.icns", Buffer.concat([icnsHeader, ...chunks]));
} finally {
  await application?.close();
  await rm(directory, { recursive: true, force: true });
}
