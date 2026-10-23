// Render the installer artwork locally using the existing mark and bundled font.
import { _electron as electron } from "@playwright/test";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
const directory = await mkdtemp(path.join(tmpdir(), "rowberry-dmg-art-"));
let application;
try {
  await writeFile(path.join(directory, "package.json"), '{"main":"main.cjs"}');
  await writeFile(
    path.join(directory, "main.cjs"),
    'const {app,BrowserWindow}=require("electron");app.whenReady().then(()=>{new BrowserWindow({width:660,height:420,show:false,webPreferences:{sandbox:true}}).loadURL("about:blank")});',
  );
  application = await electron.launch({ args: [directory] });
  const page = await application.firstWindow();
  await page.setViewportSize({ width: 660, height: 420 });
  const mark = await readFile("assets/branding/rowberry-mark.svg", "utf8");
  const font = await readFile("src/renderer/assets/fonts/Baloo2-Variable.ttf");
  await page.setContent(`
    <style>
      @font-face { font-family: Baloo; src: url(data:font/ttf;base64,${font.toString("base64")}); font-weight: 400 800; }
      * { box-sizing: border-box; } body { margin: 0; width: 660px; height: 420px; background: #f7f5f0; color: #191b24; font-family: -apple-system, sans-serif; }
      header { height: 150px; background: #191b24; color: #f7f5f0; padding: 26px 42px; border-top: 5px solid #9b7bfa; }
      .brand { display: flex; gap: 13px; align-items: center; height: 54px; }
      .brand svg { width: 26px; height: 47px; } .wordmark { font: 800 42px/1 Baloo; }
      header p { margin: 16px 0 0; color: #d4cfdf; font-size: 15px; }
      .arrow { position: absolute; top: 223px; left: 304px; width: 52px; height: 32px; }
      footer { position: absolute; top: 340px; width: 100%; text-align: center; }
      footer strong { font-size: 17px; font-weight: 600; } footer p { font-size: 13px; color: #64616d; margin: 10px 0; }
    </style>
    <header><div class="brand">${mark}<span class="wordmark">rowberry</span></div><p>A little clarity for your PostgreSQL.</p></header>
    <svg class="arrow" viewBox="0 0 52 32" fill="none"><path d="M3 16h43M33 4l13 12-13 12" stroke="#8660df" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>
    <footer><strong>Drag Rowberry to Applications</strong><p>Then open Rowberry from your Applications folder.</p></footer>
  `);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: "assets/branding/dmg-background.png" });
} finally {
  await application?.close();
  await rm(directory, { recursive: true, force: true });
}
