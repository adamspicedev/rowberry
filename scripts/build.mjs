import { copyFile } from "node:fs/promises";
import { build } from "esbuild";
import { build as viteBuild } from "vite";
await build({
  entryPoints: ["src/main/index.ts"],
  outfile: "dist/main/index.cjs",
  bundle: true,
  platform: "node",
  external: ["electron", "@napi-rs/keyring"],
  format: "cjs",
});
await build({
  entryPoints: ["src/preload/index.ts"],
  outfile: "dist/preload/index.cjs",
  bundle: true,
  platform: "node",
  external: ["electron"],
  format: "cjs",
});
await build({
  entryPoints: ["src/database/index.ts"],
  outfile: "dist/database/index.cjs",
  bundle: true,
  platform: "node",
  format: "cjs",
  external: ["pg-native"],
});
await viteBuild();

await copyFile("assets/branding/icons/512.png", "dist/renderer/app-icon.png");
