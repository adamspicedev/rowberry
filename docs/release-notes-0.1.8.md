# Rowberry 0.1.8 candidate

macOS Apple-silicon development candidate.

- Turning **Recover drafts on this device** back on now captures the current contents of open SQL, JSON and table editors without requiring another edit.
- Recovery includes inactive open tabs, invalid JSON, staged table values and unfinished cell text. Previously closed or explicitly discarded editors are not brought back by this change.
- Clear pending recovery copies when the setting is disabled after a failed startup read, so retrying the read cannot revive those discarded copies.
- Recovery remains local and copy-only. It never runs SQL or saves a recovered edit to the database automatically.

Draft saves use the existing short delay. Keep the window open and follow any recovery-save error before relying on persistence. The separate native Home-key focus issue with VoiceOver active remains unresolved. Final-release acceptance remains pending.
