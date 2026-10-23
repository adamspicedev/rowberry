# Drafts and recovery

Rowberry can retain local copies of in-progress work so you can return after reconnecting or reopening the app.

## What recovery means

A recovered draft is a copy of work on this device. It is not evidence that the database was changed, and it is not automatically applied to the server.

Use the workspace recovery controls to inspect available copies, restore the one you need, or discard copies you no longer want. Check the connection and table before applying a recovered edit.

## When the database has changed

The server may have changed while the app was closed. Reload the current row and compare it with your draft. Optimistic conflict checks are intended to prevent silently overwriting a value that changed since it was loaded.

If an earlier operation had an unknown outcome, inspect the database before retrying it. Recovery does not establish whether that operation committed.

## Sensitive data

Drafts and saved queries can contain database values and SQL text. They remain local, but local does not mean encrypted by Rowberry. Protect your operating system account and disk, and clear recovery copies that you no longer need.

See [security and local data](security.md) for storage details.
