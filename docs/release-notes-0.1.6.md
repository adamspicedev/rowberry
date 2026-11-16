# Rowberry 0.1.6 candidate

macOS Apple-silicon development candidate.

- Make the unfinished-query confirmation usable from the keyboard, whether opened with **End unfinished result…** or by trying to run another statement.
- Start on **Keep result**, keep keyboard focus in the prompt, and return to the opening control after cancellation. Escape preserves the current result and SQL draft before ending starts.
- Show progress and errors inside the confirmation. Once ending starts, wait for its result; the prompt cannot cancel a close already in progress.
- After ending the old result, focus **Run SQL / selection**, or **Reopen session** if its connection has been lost. Reopening or ending a result never automatically runs the pending SQL.

Ending an unfinished result can commit an implicit mutation; it does not undo changes. The separate Home-key focus issue with VoiceOver active remains unresolved. Final-release acceptance remains pending.
