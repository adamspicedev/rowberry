import { build } from "esbuild";
import { build as viteBuild } from "vite";
await build({
  entryPoints: ["src/main/index.ts"],
  outfile: "dist/main/index.cjs",
  bundle: true,
  platform: "node",
  external: ["electron"],
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
await viteBuild();
