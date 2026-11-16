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
4. Choose **Save to database** to open the save preview.
5. Review the original and pending values, then choose **Confirm save** to write the change.
6. Check the reported result before closing the draft. **Cancel preview** returns to editing without saving.

Changing text in the editor does not immediately write to PostgreSQL. A recovered draft also remains a local copy until explicitly applied.

## Cancel or discard changes

From version 0.1.5, choosing **Close JSON** with unsaved changes or **Discard draft…** opens a confirmation with focus on **Keep editing JSON**. Tab and Shift–Tab move between the two choices.

Choose **Keep editing JSON** or press Escape to preserve your draft and return to the button that opened the prompt. Choose **Discard and close JSON** to remove the local draft and close the inspector. Discarding does not change the database or undo an earlier save.

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
