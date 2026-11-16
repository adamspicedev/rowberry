# Rowberry 0.1.7 candidate

macOS Apple-silicon development candidate.

- Keep connection deletion open while the request is pending, preventing a late reply from closing a different connection's unsaved editor.
- Start the confirmation on **Cancel**, contain keyboard navigation, and return to **More connection actions** when cancelled before deletion starts.
- Prevent repeated deletion requests and show progress. If deletion fails, keep its error in the confirmation so you can retry or cancel.
- After successful removal, focus **New connection**. Removing a saved connection does not delete the database or its tables.

The separate native Home-key focus issue with VoiceOver active remains unresolved. Final-release acceptance remains pending.
