# Interface refinement contract

Rowberry is a macOS database workbench for repeated connection, table, SQL and JSON tasks. The user's Beekeeper screenshots establish the reference: persistent document tabs, a compact navigation sidebar and a clear primary connection action.

- Connection: Connect saves and opens; Test checks without persistence; Cancel preserves the existing discard guard. Save-only and Delete live in an accessible native popover with Escape/outside dismissal.
- Workspace: neutral document surfaces, compact toolbars, consistent field sizing and restrained selection colour. Keep drafts and results mounted across tab changes.
- Typography: system font for work, monospace for data, stable numerical counters. Brand font only for the wordmark.
- Target windows: 1440x960 and 1024x768; connection captures additionally 1440x1040. Long addresses truncate in navigation and remain editable in fields.
- Loading: existing busy labels and disabled actions prevent duplicate requests.
- Empty: existing workspace offers connection guidance.
- Error: inline connection errors retain entered settings for retry.
- Partial: existing disconnected-workspace and session-only credential messages remain visible.
- Success: isolated test result and saved connection list provide feedback.
- Permission: unavailable credential store explains session-only storage; do not claim a native locked-Keychain test.

Use disposable app profiles and preserve the existing manual QA PostgreSQL fixture. No external design service or new dependencies are needed.
