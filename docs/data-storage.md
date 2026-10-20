# Local data and recovery

Rowberry stores connection metadata, named SQL queries, preferences and versioned workspace state in `profiles.sqlite` inside its application data directory. Existing installations retain the internal `dbapp` directory name:

- macOS: `~/Library/Application Support/dbapp/profiles.sqlite`
- Windows: `%APPDATA%/dbapp/profiles.sqlite`
- Linux: `$XDG_CONFIG_HOME/dbapp/profiles.sqlite` (normally `~/.config/dbapp/profiles.sqlite`)

A `--user-data-dir` launch option overrides this directory. SQLite may create temporary journal files alongside the database. Restrict access to the whole directory. Database credentials use the operating system credential store, or memory for session-only passwords; they are never included in workspace state. Query results and original row caches are not persisted.

Recovery can contain sensitive SQL, JSON and cell values, including invalid JSON. Workspace saves are debounced and transactional; edits made immediately before a crash may not have reached disk. The recovery checkbox disables persistence of SQL editor text and all value drafts and immediately requests removal of existing persisted copies. Live editors remain usable. SQLite secure deletion is enabled, but backups and filesystem snapshots can retain older contents. Named saved queries remain explicitly saved documents.

Recovered values appear as local, copy-only text. They contain no reusable database row targets or session capabilities. Reopen a current database value and compare it explicitly before applying recovered text. Startup does not connect to a server, run SQL or replay mutations. SQL tabs are restored only into an explicitly opened connection. Nonempty SQL is treated as unsaved editor work for close prompts, even if a named copy has been saved.

The older `rowberry.sql.drafts` browser key is migrated to detached SQL recovery copies and removed after a successful transaction. Copy recovered SQL into a new editor tab explicitly; migration never replaces active editor tabs. Failed migration keeps the key and offers Retry legacy SQL migration; disabled recovery removes the key without reading it. Recovery never falls back to browser SQL storage. JSON panel width remains a browser preference containing only a number.

If reading or saving fails, Rowberry reports a recovery error and retains live drafts. Retry after freeing disk space; copy important work before closing. If the SQLite file cannot open or migrate, the startup dialog offers Quit or a temporary in-memory workspace. The original file is preserved. Temporary mode cannot persist anything and must not be used as a substitute for repairing the original profile. No automatic corruption reset or database mutation retry occurs.
