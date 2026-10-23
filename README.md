<p align="center">
  <img src="assets/branding/rowberry-mark.svg" alt="Rowberry berry mark" width="112">
</p>

<h1 align="center">Rowberry</h1>

<p align="center">
  <strong>A little clarity for your PostgreSQL.</strong><br>
  Browse tables, write SQL, and work with JSON in a local desktop workspace.
</p>

<p align="center">
  <a href="#what-you-can-do">Features</a> ·
  <a href="#get-started">Get started</a> ·
  <a href="#documentation">Documentation</a> ·
  <a href="CONTRIBUTING.md">Contribute</a>
</p>

---

Rowberry brings your PostgreSQL connections, queries, tables, and JSON into one desktop app. It connects directly to your database and keeps workspace data on your machine, with no Rowberry account, hosted service, telemetry, or paid tier.

**Early development · PostgreSQL · GPL-3.0-only**

> [!IMPORTANT]
> Rowberry is an early 0.1.0 project. Public distribution is not yet qualified: platform testing, signing, and installation checks remain outstanding. The current way to try it is to run from source. Start with a disposable database while evaluating it.

## What you can do

| Workflow              | What Rowberry brings                                                                                                 |
| --------------------- | -------------------------------------------------------------------------------------------------------------------- |
| **Connect**           | Saved connection profiles, verified TLS by default, and passwords stored in your OS credential store when available. |
| **Explore**           | Schema navigation and paged table browsing without loading an entire table into the UI.                              |
| **Write SQL**         | Multiple editor tabs, table and column completion, query cancellation, and explicit transaction controls.            |
| **Work with JSON**    | Inspect, search, and edit JSON while preserving large numbers and original text. Preview changes before saving.      |
| **Edit deliberately** | Guarded table and JSON saves for rows with a stable identity, with optimistic conflict checks.                       |
| **Pick up your work** | Named saved queries and local draft recovery. Recovered values remain copies until you explicitly apply them.        |

SQL results are read only; editing happens through eligible table rows and their JSON values. PostgreSQL is the only database engine currently supported. Multi-statement SQL batches and COPY streaming are not supported.

## Get started

You need **Bun 1.4.2**, **Node.js 22.12+**, and a graphical desktop. From a local checkout:

```sh
bun install --frozen-lockfile
bun run dev
```

This builds Rowberry and opens Electron. After changing source, close the app and run the command again; this is not a hot-reload development server.

Add a connection to your PostgreSQL server, browse a schema, or open **SQL workspace** to run a query. Docker is only needed for the project's disposable database test fixtures, not to connect to an existing server.

### Platform targets

| Platform | Package target              | Status                    |
| -------- | --------------------------- | ------------------------- |
| macOS    | Apple silicon and Intel DMG | Qualification in progress |
| Windows  | x64 NSIS installer          | Qualification in progress |
| Linux    | x64 AppImage and deb        | Qualification in progress |

These are build targets, not a claim that every platform has passed release testing. See [platform requirements](docs/supported-platforms.md) for OS requirements and the [release checklist](docs/release-checklist.md) for remaining work.

## Your data stays yours

Rowberry stores connection metadata, saved SQL, and recoverable drafts locally. Remembered passwords use the operating system's credential store; if it is unavailable, passwords stay in memory for the session. Workspace files and drafts can still contain sensitive SQL or database values.

The desktop renderer is sandboxed and loads local assets. Database access runs behind a validated bridge in a separate worker process. Verified TLS is the default.

Use a database role with only the permissions you need. Running SQL can change data, and cancelling a query does not prove that a write was rolled back. Read the [security guide](docs/security.md) and [storage and recovery guide](docs/data-storage.md) for the details.

## Documentation

See the [v1 roadmap](docs/roadmap-v1.md) for release scope and milestones, and the [v1 to-do list](docs/v1-todo.md) for progress and acceptance evidence.

The [Rowberry website](https://rowberry.spicey.dev/) and [user documentation](https://rowberry.spicey.dev/docs/) live in `apps/web`. See the [website contributor guide](apps/web/README.md) to develop or deploy them.

| Guide                                                  | Start here when you want to…                                                       |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| [Contributing](CONTRIBUTING.md)                        | Set up development, choose checks, and prepare a focused pull request.             |
| [Development reference](docs/development.md)           | Understand SQL behaviour, run live database checks, or build and verify a package. |
| [Storage and recovery](docs/data-storage.md)           | Find local files and understand what recovery saves.                               |
| [Security](docs/security.md)                           | Understand credentials, TLS, and process boundaries.                               |
| [Platform requirements](docs/supported-platforms.md)   | Check platform targets and qualification requirements.                             |
| [Release checklist](docs/release-checklist.md)         | See what must be verified before distribution.                                     |
| [Candidate release notes](docs/release-notes-0.1.0.md) | Review the scope of 0.1.0.                                                         |

## Help shape Rowberry

Bug reports, small fixes, documentation improvements, and thoughtful feature proposals are welcome. Start with [Contributing](CONTRIBUTING.md): discuss code changes in an issue, keep the scope focused, and include evidence that the changed behaviour works. Documentation-only corrections can go straight to a pull request.

Everyone participating is expected to follow our [Code of Conduct](CODE_OF_CONDUCT.md).

## License and credits

Rowberry is licensed under [GPL-3.0-only](LICENSE). The bundled Baloo 2 typeface has its own [SIL Open Font License](src/renderer/assets/fonts/OFL.txt). See [branding provenance](assets/branding/PROVENANCE.md) for the berry mark and packaging assets.

Built with Electron, React, TypeScript, PostgreSQL tooling, and Monaco Editor. Our repository documentation takes inspiration from [Bambuddy](https://github.com/maziggy/bambuddy)'s welcoming presentation and contribution workflow.
