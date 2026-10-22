# macOS installation, replacement and removal

Use the DMG for your Mac's architecture: arm64 for Apple Silicon, x64 for Intel. Only packages explicitly accepted for release are qualified; local unsigned candidates do not establish signing or Gatekeeper acceptance.

## Install

Open the DMG and copy Rowberry.app into Applications. Eject the disk image and launch the copied application. Record any first-launch or security prompts during qualification. Do not run the qualification session from inside the mounted image.

For a fresh-account test, use a separate macOS account with its own login Keychain. An empty `--user-data-dir` on an existing account isolates Rowberry's files but does not establish fresh-account credential behaviour.

## Back up and replace

1. Quit Rowberry completely before copying its data or replacing its application bundle.
2. Back up the entire `~/Library/Application Support/dbapp` directory to a private location. If launched with `--user-data-dir`, back up that directory instead. Include any SQLite journal files alongside the database. This backup can contain sensitive SQL and draft data.
3. Passwords remain in macOS Keychain and are not included in the directory backup. Make sure you can obtain the database credentials again if moving to another Mac or account; never export passwords into QA reports.
4. Keep the previous application package and its digests. Copy the candidate's Rowberry.app over the previous application while it is closed, then eject the image and launch the installed copy.
5. Verify saved connections, remembered passwords, named queries and recovered drafts before accepting the upgrade. Follow the [baseline policy](upgrade-baselines.md) and record the exact package hashes.

If an upgrade fails, preserve the failed profile for diagnosis. Do not launch the older app against a profile migrated by a newer version. To recover, use the previous app with a separate copy of the pre-upgrade backup, keeping the failed candidate profile intact.

## Remove and reinstall

Moving Rowberry.app to Trash removes the application bundle. It does not remove the `dbapp` application-data directory or Keychain credentials. Reinstalling the application can therefore restore the saved workspace and connections.

To remove remembered passwords, delete the saved connections through Rowberry before removing the app and confirm deletion succeeds. Removing the application-data directory alone does not delete Keychain entries. For a complete data removal, quit the app and separately remove the relevant application-data directory after reviewing/backing up anything you need. Existing backups and filesystem snapshots can retain older data.

Use a disposable profile for removal tests. Confirm that removing only the bundle retains its profile and credential, then verify a reinstall can recover the data and authenticate. Record whether the operation used Finder or automated file copying; those are distinct observations. Also record OS account, architecture, installation path and signing/Gatekeeper status.
