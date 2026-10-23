# A little clarity for your PostgreSQL

Rowberry is a free, open-source desktop workspace for PostgreSQL. Browse tables, write SQL, and inspect nested JSON without moving between tools.

It connects directly to your database. There is no Rowberry account or hosted database service.

!!! note "Early development"
Rowberry is not yet a qualified public release. The current way to try it is to [run from source](getting-started.md). Use a disposable database while evaluating it.

## Find your next step

| I want to…                          | Start here                              |
| ----------------------------------- | --------------------------------------- |
| Try the app                         | [Get started](getting-started.md)       |
| Set up credentials and TLS          | [Connect to PostgreSQL](connections.md) |
| Explore schemas and rows            | [Browse tables](tables.md)              |
| Run a query or manage a transaction | [Write SQL](sql.md)                     |
| Inspect or edit a JSON value        | [Work with JSON](json.md)               |
| Recover work after reconnecting     | [Drafts and recovery](recovery.md)      |
| Understand where my data goes       | [Security and local data](security.md)  |

See the [roadmap to v1](roadmap.md) for what we are working towards.

## A few boundaries worth knowing

- PostgreSQL is the only supported database engine.
- SQL results are read only. Editing happens through eligible table rows and their JSON values.
- A query execution accepts one statement. Multi-statement batches and COPY streaming are not supported.
- macOS is the current desktop priority. See [project status](status.md) for platform qualification.

[Back to the Rowberry website](https://rowberry.spicey.dev/)
