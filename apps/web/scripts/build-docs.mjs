import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { copyFileSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { loadEnv } from "vite";
import { analyticsOptions } from "../src/analytics-options.ts";

const root = fileURLToPath(new URL("../", import.meta.url));
const python = join(
  root,
  ".venv",
  process.platform === "win32" ? "Scripts/python.exe" : "bin/python",
);
function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
run(process.env.PYTHON ?? "python3", ["-m", "venv", ".venv"]);
run(python, ["-m", "pip", "install", "--disable-pip-version-check", "-r", "requirements.txt"]);
run(python, ["-m", "mkdocs", "build", "--strict"]);

// MkDocs pages do not mount the React root. Use the same installed SDK and
// options here, with deferred local scripts so analytics cannot block rendering.
const env = { ...loadEnv("production", root, "VITE_PUBLIC_POSTHOG_"), ...process.env };
const token = env.VITE_PUBLIC_POSTHOG_PROJECT_TOKEN;
const host = env.VITE_PUBLIC_POSTHOG_HOST;
if (token && host) {
  const output = join(root, "public/docs");
  const assets = join(output, "assets");
  mkdirSync(assets, { recursive: true });
  copyFileSync(join(root, "node_modules/posthog-js/dist/array.js"), join(assets, "posthog.js"));
  writeFileSync(
    join(assets, "posthog-init.js"),
    `window.posthog?.init(${JSON.stringify(token)}, ${JSON.stringify({ ...analyticsOptions, api_host: host })});\n`,
  );
  function instrument(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) instrument(path);
      else if (entry.name.endsWith(".html")) {
        writeFileSync(
          path,
          readFileSync(path, "utf8").replace(
            "</head>",
            '<script defer src="/docs/assets/posthog.js"></script><script defer src="/docs/assets/posthog-init.js"></script></head>',
          ),
        );
      }
    }
  }
  instrument(output);
}
