# Rowberry 0.1.3 candidate

macOS Apple-silicon development candidate.

- Wait for Keychain credential access before starting the database connection timeout. Taking time to approve macOS's access prompt no longer consumes the network connection budget.
- Announce **Waiting for Keychain access…** while credentials are being retrieved. Disconnect remains available, and cancelled or superseded requests cannot open a late database connection.

The network connection still has a bounded timeout. Cancelling Rowberry's request does not dismiss a macOS-owned Keychain prompt, but its eventual result cannot reconnect the cancelled session.

Final-release acceptance remains pending.
