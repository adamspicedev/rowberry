// Render the checked-in vector master locally with Electron; no network or fonts.
import { execFileSync } from "node:child_process";
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
  // Let Apple's encoder choose the correct bitmap/mask formats for small icons.
  // PNG payloads in hand-written icp4/icp5 chunks decode as corrupt pixels in Finder.
  const iconset = path.join(directory, "rowberry.iconset");
  await mkdir(iconset);
  for (const size of [16, 32, 128, 256, 512]) {
    await writeFile(path.join(iconset, `icon_${size}x${size}.png`), images.get(size));
    await writeFile(path.join(iconset, `icon_${size}x${size}@2x.png`), images.get(size * 2));
  }
  execFileSync("iconutil", ["-c", "icns", iconset, "-o", "assets/branding/rowberry.icns"]);
  const decoded = path.join(directory, "decoded.iconset");
  execFileSync("iconutil", ["-c", "iconset", "assets/branding/rowberry.icns", "-o", decoded]);
  await application.evaluate(
    ({ nativeImage }, { iconset, decoded }) => {
      const { readFileSync } = process.getBuiltinModule("node:fs");
      for (const size of [16, 32, 128, 256, 512]) {
        for (const scale of ["", "@2x"]) {
          const name = `icon_${size}x${size}${scale}.png`;
          const source = nativeImage.createFromBuffer(readFileSync(`${iconset}/${name}`));
          const result = nativeImage.createFromBuffer(readFileSync(`${decoded}/${name}`));
          const expected = size * (scale ? 2 : 1);
          if (
            source.isEmpty() ||
            result.isEmpty() ||
            result.getSize().width !== expected ||
            result.getSize().height !== expected
          )
            throw new Error(`Missing or incorrectly sized macOS icon representation: ${name}`);
        }
      }
    },
    { iconset, decoded },
  );
} finally {
  await application?.close();
  await rm(directory, { recursive: true, force: true });
}
