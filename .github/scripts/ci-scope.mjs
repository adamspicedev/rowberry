import { execFileSync } from "node:child_process";
import { appendFileSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export function classifyPaths(paths) {
  let desktop = false;
  let website = false;
  for (const path of paths) {
    if (path.startsWith(".github/")) {
      desktop = true;
      website = true;
    } else if (path.startsWith("apps/web/") || path === ".vercelignore") {
      website = true;
    } else if (
      path.startsWith("docs/") ||
      /^[^/]+\.md$/.test(path) ||
      ["LICENSE", ".gitignore", ".oxfmtignore", ".oxfmtrc.json"].includes(path)
    ) {
      // Documentation and formatting settings do not change either application.
    } else if (
      ["src/", "tests/", "scripts/", "assets/"].some((prefix) => path.startsWith(prefix)) ||
      [
        "package.json",
        "bun.lock",
        "compose.yaml",
        "electron-builder.yml",
        "tsconfig.json",
        "vite.config.ts",
        "vitest.config.ts",
      ].includes(path) ||
      /^playwright(?:\.[^/]+)?\.config\.ts$/.test(path)
    ) {
      desktop = true;
    } else {
      // Unrecognised shared configuration must not silently skip either application.
      desktop = true;
      website = true;
    }
  }
  return { desktop, website };
}

export function changedPaths(
  eventName,
  event,
  git = (args) => execFileSync("git", args, { encoding: "utf8" }),
) {
  if (eventName === "workflow_dispatch") return null;
  let range;
  if (eventName === "pull_request") {
    range = `${event.pull_request.base.sha}...${event.pull_request.head.sha}`;
  } else if (eventName === "push") {
    if (/^0+$/.test(event.before)) return null;
    range = `${event.before}..${event.after}`;
  } else {
    throw new Error(`Unsupported CI event: ${eventName}`);
  }
  // Do not detect renames: both old and new paths must participate in scope selection.
  return git(["diff", "--name-only", "--no-renames", "-z", range, "--"])
    .split("\0")
    .filter(Boolean);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, "utf8"));
  const paths = changedPaths(process.env.GITHUB_EVENT_NAME, event);
  const scope = paths === null ? { desktop: true, website: true } : classifyPaths(paths);
  appendFileSync(process.env.GITHUB_OUTPUT, `desktop=${scope.desktop}\nwebsite=${scope.website}\n`);
  console.log(`Required suites: desktop=${scope.desktop}, website=${scope.website}`);
}
