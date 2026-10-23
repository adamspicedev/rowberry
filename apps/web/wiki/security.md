# Security and local data

The desktop app connects directly to PostgreSQL. It does not send queries or database values through a Rowberry service, and it has no telemetry or automatic updater.

## What is stored locally

| Data                                      | Storage                             |
| ----------------------------------------- | ----------------------------------- |
| Connection metadata and named SQL queries | Local application profile           |
| Recoverable editor drafts                 | Local application storage           |
| Remembered passwords                      | OS credential store, when available |
| Session-only passwords                    | Memory for the session              |

On macOS the existing application profile is `~/Library/Application Support/dbapp/`. The internal directory name remains `dbapp` even though the product is named Rowberry. Named queries and connection metadata are stored in `profiles.sqlite`.

Workspace files and drafts can contain sensitive SQL or database values. Rowberry does not encrypt all local workspace content. Use OS account protection and disk encryption appropriate to your environment.

## Connection protection

Verified TLS is the default. Passwords do not fall back to plaintext files when the OS credential store is unavailable. Choose a PostgreSQL role with only the permissions needed for your work.

The renderer is sandboxed and loads local assets. Database access runs in a separate worker behind a validated bridge. These boundaries do not make arbitrary SQL harmless: statements run with the permissions of your database role.

## Writes and unknown outcomes

Table and JSON edits require a stable identity and explicit saves with conflict checking. SQL can still modify data. Cancelling a query or losing a connection does not prove that a write was rolled back. Inspect the database before retrying an operation whose outcome is unknown.

## This website

The marketing site and documentation are hosted on Vercel. They do not ask for database credentials or connect to your databases. There are no added analytics scripts or remote font requests. Normal hosting and DNS providers may process request metadata to serve the pages.

## Reporting a security issue

Use the repository's private vulnerability reporting option if it is available. Avoid posting passwords, connection strings, personal data, or exploit details in public issues. See the [repository security guide](https://github.com/adamspicedev/rowberry/blob/main/docs/security.md) for current guidance.
