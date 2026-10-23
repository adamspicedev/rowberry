# Schema browser and feedback validation

23 October 2026, Apple Silicon macOS.

Design contract: retain the user's Beekeeper reference hierarchy (schema folders, table rows, inline columns with types) while showing only implemented actions. Keep selection separate from expansion. Menus are shared between table and column actions; toasts are shared with saved connections and saved queries. Hide affects this sidebar session only and offers Undo plus Show hidden tables. Generated SELECT statements quote identifiers and never execute automatically.

Rendered checks: light at 1440x960 and dark at 1024x768. Local screenshots show the schema/column hierarchy, menu, SQL results and toast. Menu stays within window bounds. Keyboard checks cover Shift+F10, arrows, Escape and focus restoration; outside clicks dismiss the menu. This is a focused accessibility check, not a complete audit.

Validation:

- Packaged connection and schema tests: 6 passed, 1 skipped (explicit native credential-store qualification).
- Packaged PostgreSQL 18 JSON workflow: 1 passed, including clipboard operations.
- Package architecture, assets, IPC and sandbox startup smoke passed.
- Typecheck, lint, formatting and whitespace checks passed.
- Temporary quoted-identifier fixture proves generated SQL and copied names are escaped correctly. Hide/undo leaves database data unchanged; fixture removed after testing.

The shared clipboard helper follows the existing renderer copy mechanism; browser clipboard permissions remain denied. Errors stay visible until dismissed, ordinary toasts expire after seven seconds and pause while hovered or focused. At most four are displayed.

Current menu: View data, View structure, SQL: Select top 200, Copy name, Copy qualified name, Hide from sidebar, Refresh schemas. Column menu: Copy column name, View structure. Import/export, DDL mutations and ERD are not implemented by this change. CI and Intel runtime were not validated.
