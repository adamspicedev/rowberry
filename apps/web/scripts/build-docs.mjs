import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

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
