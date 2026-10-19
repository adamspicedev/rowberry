// All keys and passwords are disposable fixture values, generated outside app data.
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, chmodSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
const manifest = process.env.DBAPP_POSTGRES_FIXTURES ?? "/tmp/dbapp-task3-fixtures.json";
if (existsSync(manifest))
  throw new Error("Fixture manifest exists. Clean up the previous disposable databases first.");
const directory = mkdtempSync(path.join(tmpdir(), "dbapp-postgres-"));
chmodSync(directory, 0o755);
const docker = ["--context", process.env.DBAPP_DOCKER_CONTEXT ?? "orbstack"];
function run(command, args) {
  const result = spawnSync(command, args, { stdio: "inherit" });
  if (result.status !== 0) throw new Error(`${command} fixture setup failed`);
}
run("openssl", [
  "req",
  "-x509",
  "-newkey",
  "rsa:2048",
  "-nodes",
  "-days",
  "2",
  "-subj",
  "/CN=dbapp disposable fixture CA",
  "-keyout",
  `${directory}/ca.key`,
  "-out",
  `${directory}/ca.crt`,
]);
for (const name of ["server", "client"]) {
  run("openssl", [
    "req",
    "-newkey",
    "rsa:2048",
    "-nodes",
    "-subj",
    `/CN=${name === "server" ? "localhost" : "certfixture"}`,
    "-keyout",
    `${directory}/${name}.key`,
    "-out",
    `${directory}/${name}.csr`,
  ]);
  writeFileSync(
    `${directory}/${name}.ext`,
    name === "server"
      ? "subjectAltName=DNS:localhost,IP:127.0.0.1\nextendedKeyUsage=serverAuth\n"
      : "extendedKeyUsage=clientAuth\n",
  );
  run("openssl", [
    "x509",
    "-req",
    "-in",
    `${directory}/${name}.csr`,
    "-CA",
    `${directory}/ca.crt`,
    "-CAkey",
    `${directory}/ca.key`,
    "-CAcreateserial",
    "-days",
    "2",
    "-extfile",
    `${directory}/${name}.ext`,
    "-out",
    `${directory}/${name}.crt`,
  ]);
}
writeFileSync(
  `${directory}/pg_hba.conf`,
  "local all all trust\nhostssl all certfixture all cert\nhost all all all scram-sha-256\n",
);
writeFileSync(`${directory}/init.sql`, "CREATE ROLE certfixture LOGIN;\n");
const containers = [];
writeFileSync(manifest, JSON.stringify({ directory, containers }));
for (const version of [14, 18]) {
  const name = `dbapp-task3-pg${version}-${path.basename(directory).slice("dbapp-postgres-".length)}`;
  run("docker", [
    ...docker,
    "run",
    "--detach",
    "--name",
    name,
    "--label",
    "dbapp.disposable=task3",
    "--publish",
    `127.0.0.1:554${version}:5432`,
    "--env",
    "POSTGRES_USER=fixture",
    "--env",
    "POSTGRES_PASSWORD=fixture-only-password",
    "--env",
    "POSTGRES_DB=fixture",
    "--mount",
    `type=bind,source=${directory},target=/fixtures,readonly`,
    "--mount",
    `type=bind,source=${directory}/init.sql,target=/docker-entrypoint-initdb.d/init.sql,readonly`,
    "--tmpfs",
    version === 18 ? "/var/lib/postgresql" : "/var/lib/postgresql/data",
    `postgres:${version}`,
    "bash",
    "-c",
    "cp /fixtures/server.key /tmp/server.key && chown postgres /tmp/server.key && chmod 600 /tmp/server.key && exec docker-entrypoint.sh postgres -c ssl=on -c ssl_cert_file=/fixtures/server.crt -c ssl_key_file=/tmp/server.key -c ssl_ca_file=/fixtures/ca.crt -c hba_file=/fixtures/pg_hba.conf",
  ]);
  containers.push(name);
  writeFileSync(manifest, JSON.stringify({ directory, containers }));
  const deadline = Date.now() + 60000;
  while (true) {
    // TCP readiness avoids accepting the temporary Unix-only initdb server.
    const ready = spawnSync(
      "docker",
      [
        ...docker,
        "exec",
        name,
        "pg_isready",
        "--host",
        "127.0.0.1",
        "--username",
        "fixture",
        "--dbname",
        "fixture",
      ],
      { stdio: "ignore" },
    );
    if (ready.status === 0) break;
    if (Date.now() > deadline)
      throw new Error("PostgreSQL fixture did not become ready. Run cleanup before retrying.");
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}
process.stdout.write(`Fixture directory: ${directory}\n`);
