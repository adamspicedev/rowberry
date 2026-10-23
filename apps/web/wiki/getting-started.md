# Get started

Rowberry is currently available to try from source. There is no signed public download yet.

## What you need

- A graphical desktop. macOS 13 or later is the current priority, on Apple silicon or Intel.
- [Git](https://git-scm.com/), [Bun](https://bun.sh/) **1.4.2**, and [Node.js](https://nodejs.org/) **22.12 or later** for the desktop app.
- Access to a PostgreSQL database. Begin with disposable data while evaluating Rowberry.

Docker is not required to connect to an existing database. It is used by the project's automated database fixtures.

## Run Rowberry

```sh
git clone https://github.com/adamspicedev/rowberry.git
cd rowberry
bun install --frozen-lockfile
bun run dev
```

The last command builds the desktop app and opens Electron. This is not a hot-reload server. After changing application source, close the app and run `bun run dev` again.

## Make your first connection

1. Choose **New connection**.
2. Enter a name, host, port, database, and user. Use the connection details supplied by your database administrator.
3. Configure TLS for your server. Verified TLS is the default.
4. Enter your password and choose whether to remember it.
5. Use the connection form's test action, then connect.

See [Connect to PostgreSQL](connections.md) for certificate and password details.

## Explore a first result

Open a table from the schema sidebar, or create a SQL tab and run:

```sql
SELECT current_database(), version();
```

Try a JSON result without changing any data:

```sql
SELECT '{"message":"Hello Rowberry","items":[1,2,3]}'::jsonb AS document;
```

Choose **Inspect JSON** to explore the value. Query results stay read only; open a table when you want to edit an eligible row.

## Building a development package

From the repository root:

```sh
bun run package --mac
```

Build outputs are placed in `release/`. These are development packages, not a claim of signing, notarization, or completed release qualification. Read the repository's [macOS installation guide](https://github.com/adamspicedev/rowberry/blob/main/docs/macos-installation.md) before sharing packages.
