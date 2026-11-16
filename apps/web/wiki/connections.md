# Connect to PostgreSQL

A saved connection keeps the details you need to return to a database. Password storage is separate from those details.

## Connection details

| Field    | What to enter                                         |
| -------- | ----------------------------------------------------- |
| Name     | A label you will recognise, such as Local development |
| Host     | Your PostgreSQL server's hostname or IP address       |
| Port     | Usually `5432`; use your server's configured port     |
| Database | The database to open                                  |
| User     | A PostgreSQL role with the permissions you need       |
| Password | The password for that role                            |

A successful connection test shows that the supplied connection details work at that moment. It does not grant permissions to tables the role cannot access.

## TLS and certificates

Verified TLS is the default. Keep certificate verification enabled for remote databases. If the server uses a private certificate authority, supply its CA certificate using the connection form. Servers requiring client certificates also need the corresponding client certificate and key.

If verification fails, check the hostname, certificate chain, and certificate expiry. Disabling verification is not a repair for an incorrect certificate.

For an intentionally unencrypted local test server, the form requires acknowledgement before disabling encryption or verification.

## Remembered passwords

Remembered passwords use the operating system's credential store when available. Rowberry has no plaintext file fallback. If the credential store is unavailable, the password remains in memory for the session and you will need to enter it again later.

On macOS, credential access may involve Keychain prompts. Enter your password only into the application or operating system prompt you intended to open.

## Disconnecting and switching

Disconnect before leaving a database session you no longer need. Switching connections closes the previous database session. Open transactions and incomplete results require care: review their state before changing connections.

Workspace drafts may be recovered locally, but reconnecting does not replay SQL or automatically apply edits. See [drafts and recovery](recovery.md).

## Removing a saved connection

Disconnect first if the connection is active. Select its saved profile, open **More connection actions** (the three-dot button), and choose **Delete connection**. This removes Rowberry's saved profile and password; it does not delete your database or its tables.

From version 0.1.7, the confirmation starts on **Cancel**. Before deletion starts, Escape or Cancel returns you to the connection editor. Once you confirm deletion, wait for it to finish: the prompt stays open and cannot cancel a request already in progress. If deletion fails, the error stays in the prompt so you can retry or cancel. Successful removal returns keyboard focus to **New connection**.
