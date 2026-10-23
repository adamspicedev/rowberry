# Browse tables

The schema sidebar shows the database's schemas and tables. Expand a table to see its columns and types, then open its data in a workspace tab.

## Find what you need

Use the sidebar filter to narrow the list. Refresh schemas after a database structure change. Tables are paged so you can browse without loading the entire table into the interface.

The table context menu provides shortcuts for viewing data, viewing structure, copying names, generating a SELECT query, and hiding a table from the sidebar. Hiding is a local navigation choice; it does not delete the database table.

Generated SELECT queries open for you to review. Opening a query is not the same as executing it.

## Inspect a value

Select a row or a JSON value to open the inspection panel. The panel keeps the value beside the table rather than replacing the workspace.

SQL NULL and JSON `null` are distinct values. Check the value's type and state before editing it.

## Edit an eligible row

Table editing requires a stable row identity. If Rowberry cannot safely identify the row, editing remains unavailable.

1. Open the table and choose the value you want to edit.
2. Make the change in the appropriate editor.
3. Review the pending change.
4. Save explicitly and check the outcome.

Saves use optimistic conflict checks. If another client changed the row after you loaded it, reload and compare the latest value before deciding what to do. Do not repeatedly submit an old draft over a conflict.

Query results are always read only. If an edit action is disabled there, open the underlying table to edit an eligible row instead.
