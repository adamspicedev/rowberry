# JSON tree manual accessibility session — 26 October 2026

Maintainer-guided testing of the previously linked unsigned Apple-silicon DMG from PR #11. The user reported installing and opening it; the installed app hash was not independently verified during this session. This was a coached check, not an unfamiliar-user usability session.

Using a SQL result containing `{"name":"Rowberry","items":[{"name":"Apple"},{"name":"Berry"}]}`, the user confirmed:

- Right Arrow expands `items`, then selects its first child.
- Left Arrow returns to the parent, then collapses it while retaining selection.
- VoiceOver speaks the selected/expanded state and announces collapse correctly.

The spoken feedback also exposed duplicated labels such as “items items” and “zero zero”, and an inappropriate “Expand name” control on scalar values.

## Follow-up fix

Each tree row now has an explicit accessible name containing its key and value or container summary, excluding its disclosure button's action label. Scalars use a decorative marker instead of a disabled Expand button. Container disclosure buttons retain their Expand/Collapse action names. Exact numeric lexemes remain intact in accessible names.

Regression checks verify container and scalar accessible names, filtered nested values, absence of scalar buttons and expanded state, and the existing keyboard/virtualization workflows. Source PG18 regression, typecheck, lint and build pass. Packaged results are recorded in the accompanying PR.

The maintainer subsequently supplied VoiceOver speech showing the corrected names, values, sibling positions and expanded/collapsed states, with no repeated names or scalar Expand controls. They also confirmed keyboard-only inspector exit and return to typing in SQL. These coached retests pass based on their report; the installed build hash was not independently verified. Large-array announcements, filter/clear focus and broader application accessibility remain open. The confirmed expand/collapse results do not establish full accessibility acceptance.

The rebuilt unsigned package passed the PG18 JSON regression, including accessible-name assertions and existing focus/navigation workflows. DMG SHA-256: `1118a6baa1042ce890dbea4f5edeff18d2b23504af7861a6de5612b638a8e391`. These automated results do not verify the revised VoiceOver speech.
