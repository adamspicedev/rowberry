# V1-03 usability session

Prepared 24 October 2026. Use this with an unsigned local development build while signing is deferred. This is an observation protocol, not a completed participant session or release acceptance.

## Prepare the session

Use a disposable PostgreSQL database and a temporary app profile. Record source revision, package/build identity, macOS version, display size and theme. Give the participant fixture-only credentials. Do not use a personal workspace or production database.

Provide a table containing an integer primary key, a text field and a JSON document with a nested object, Unicode text and a numeric literal larger than JavaScript's safe integer range. Record original rows so saves can be checked independently. Run destructive/conflict scenarios only against this fixture.

Recruit three people unfamiliar with the interface where practical. Record prior database experience. The developer/agent running scripted automation does not count as an unfamiliar participant.

## Task prompts

Read the requested outcome without naming buttons or giving click instructions. Record the first action, hesitation, wrong turns, completion and any assistance. If someone gets stuck, record that before helping; assisted success does not establish discoverability.

1. Connect to the supplied test database and give the connection a recognisable name.
2. Find the supplied table and inspect one row's nested JSON. Find a specified nested value.
3. Open a SQL query alongside the table, run a query, then return to the table without losing the query text.
4. Change a specified text value and nested JSON value. Save them when ready. Explain how you know whether the database has changed.
5. Check the stored values in a separate query. Confirm the unrelated large number and Unicode text have not changed.
6. Make another JSON edit but leave it unsaved. Quit and reopen the app. Find the unfinished work and explain whether it has been saved to the database.
7. Discard that unfinished change, restart again and check that it stays discarded.
8. Repeat table navigation and opening/dismissing a menu using the keyboard. Try the alternate theme and a 1024 × 768 window.

An observer separately verifies stored values using an independent database session. Do not substitute the editor's visible text for persistence evidence. VoiceOver testing is a separate recorded task; keyboard success alone does not establish it.

## Record each session

- Date, observer and anonymised participant identifier:
- Prior PostgreSQL/client experience:
- Source revision and package/build identity:
- OS/architecture, window dimensions, theme and assistive technology:
- Disposable fixture identity and starting data:

| Task                  | First action / hesitation | Outcome | Coaching needed | Persistence/recovery evidence | Finding |
| --------------------- | ------------------------- | ------- | --------------- | ----------------------------- | ------- |
| 1–8: one row per task | Not observed              | Not run | Not assessed    | Pending                       | Pending |

Use completed, assisted, failed or not run. Record exact confusing labels/states and reproduction steps. Redact credentials and private data from screenshots. Group repeated problems, choose the smallest useful fix, and repeat affected tasks on the changed build.

## Completion boundary

V1-03 remains open until participant observations and any focused fixes/retests are recorded. Automated regressions establish behaviour; they do not establish uncoached task completion. Signing and Gatekeeper qualification are separate deferred work.
