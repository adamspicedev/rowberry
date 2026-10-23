# Write SQL

Open a SQL tab to work on a query. Each SQL tab has its own PostgreSQL connection and transaction state.

## Run a statement

Write a single statement and choose **Run SQL / selection**. Selected text is executed when a selection exists; otherwise the editor contents are used. Use **Control+Space** for table and column completion.

```sql
SELECT current_database(), current_user;
```

Rowberry does not support multi-statement batches or COPY streaming. Split a script into individual statements and run them deliberately.

Results are paged and read only. Moving to the next page replaces the current page rather than accumulating every result in memory.

## Save a useful query

Give the query a name and save it for later. Opening a saved query places its text in the editor; it does not run automatically. Saved SQL is stored locally and may contain sensitive values, so avoid embedding passwords or tokens.

## Transactions

Use **BEGIN**, **COMMIT**, and **ROLLBACK** on the relevant tab. Transaction state belongs to that tab's connection, not to every open tab.

- **BEGIN** starts a transaction.
- **COMMIT** applies its pending changes.
- **ROLLBACK** discards its uncommitted changes.

Closing a SQL tab disconnects its connection and rolls back an open transaction. Treat unknown or aborted transaction states as something to resolve before continuing.

## Cancellation and unfinished results

**Cancel query** requests cancellation of active work. Cancellation does not prove that a write was rolled back. If the outcome is unknown, inspect the database before retrying. Rowberry does not automatically retry SQL.

**End unfinished result** asks for confirmation because closing a result portal can commit an implicit mutation. Read the prompt rather than treating it as a harmless way to clear the results pane.
