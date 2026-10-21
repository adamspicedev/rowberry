import { readFileSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { z } from "zod";
const manifest = process.env.DBAPP_POSTGRES_FIXTURES ?? "/tmp/dbapp-task3-fixtures.json";
const fixture = z
  .object({
    directory: z.string(),
    containers: z.array(z.string().regex(/^dbapp-task3-pg1[4-8](?:-[a-zA-Z0-9-]+)?$/)),
  })
  .parse(JSON.parse(readFileSync(manifest, "utf8")));
const docker = ["--context", process.env.DBAPP_DOCKER_CONTEXT ?? "orbstack"];
for (const container of fixture.containers) {
  const label = spawnSync(
    "docker",
    [...docker, "inspect", "--format", '{{index .Config.Labels "dbapp.disposable"}}', container],
    { encoding: "utf8" },
  );
  if (label.status !== 0 || label.stdout.trim() !== "task3")
    throw new Error("Refusing to remove a container without the disposable fixture label.");
  const result = spawnSync("docker", [...docker, "rm", "--force", container], { stdio: "inherit" });
  if (result.status !== 0) throw new Error("Fixture cleanup failed.");
}
// Validate directory before deleting generated keys: never accept an app-data path.
if (!/\/dbapp-postgres-[a-zA-Z0-9]+$/.test(fixture.directory))
  throw new Error("Unexpected fixture directory.");
rmSync(fixture.directory, { recursive: true, force: true });
rmSync(manifest, { force: true });
