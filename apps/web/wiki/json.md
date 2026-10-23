# Work with JSON

The JSON inspector gives a value room to breathe beside your table or query.

## Inspect and search

Open **Inspect JSON** on a result value. Expand the tree to explore nested objects and arrays. Filter keys and values to find a particular field, or use the text view when the source representation is more useful.

Rowberry preserves original JSON text and large numeric values rather than relying on ordinary JavaScript number conversion.

## Edit a JSON value

SQL results are read only. To edit JSON, open its table and select a value from an eligible row with a stable identity.

1. Open the JSON value in the inspector.
2. Choose **Edit JSON** and make your changes.
3. Resolve any validation errors.
4. Review the change preview.
5. Choose **Save to database** and check the result.

Changing text in the editor does not immediately write to PostgreSQL. A recovered draft also remains a local copy until explicitly applied.

## Why is saving disabled?

Common reasons include:

- You opened a read-only SQL result.
- The table row does not have a stable identity.
- The edited JSON is invalid.
- There are no changes to save.
- Another operation is still in progress.

Read the inspector's status message. If a save reports a conflict, reload the row and compare your draft with the current database value.

## SQL NULL is not JSON null

A database column containing SQL NULL is different from a JSON document whose value is `null`. Keep that distinction when choosing how to update a cell. Inspect the table value rather than inferring its type from a rendered row-as-JSON representation.
