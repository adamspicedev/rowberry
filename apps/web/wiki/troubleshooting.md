# Troubleshooting

## The connection fails

Check the host, port, database name, role, and network path. Confirm that PostgreSQL permits your client's address. For TLS errors, verify the server hostname and trusted CA certificate rather than disabling verification as a first step.

A successful connection does not imply access to every schema. Table permissions come from PostgreSQL.

## My password was not remembered

Remembered passwords depend on the OS credential store. When it is unavailable, Rowberry keeps a password only for the session. Re-enter it when reconnecting and check any operating system credential-access prompts.

## I cannot edit a value

SQL query results are read only. Open the table and select a row that has a stable identity. Read the editor's status message for validation errors, unchanged values, or an operation already in progress.

## A save reports a conflict

The row may have changed since you loaded it. Preserve your draft, reload the current row, and compare the values before deciding which changes to apply.

## A query was cancelled but I do not know whether it wrote data

Cancellation is not proof of rollback. Inspect the database state using a separate appropriate query before retrying the write. Do not assume a recovered draft means a prior operation failed.

## I changed source but the app still looks the same

`bun run dev` builds and launches the desktop app; it is not a hot-reload server. Close the app and run the command again from your checkout.

## Report a reproducible bug

[Open an issue](https://github.com/adamspicedev/rowberry/issues) with your OS, architecture, Rowberry commit or build, PostgreSQL version, steps, expected result, and actual result. Use a small disposable example. Remove credentials, real hostnames, and private database values from logs and screenshots.
