# Local macOS signing

Local signed candidates require a valid **Developer ID Application** identity, including its private key, in the login Keychain. Keep certificates' private keys and notarization credentials outside the repository.

Store notarization credentials interactively with `xcrun notarytool store-credentials rowberry-notary --apple-id YOUR_APPLE_ID --team-id YOUR_TEAM_ID`. The omitted password is requested through a secure prompt and validated before being saved to Keychain.

Build a signed Apple-silicon candidate:

```sh
bun run build
APPLE_KEYCHAIN_PROFILE=rowberry-notary \
CSC_IDENTITY_AUTO_DISCOVERY=true \
bun x --no-install electron-builder --mac --arm64 --publish never \
  -c.forceCodeSigning=true -c.directories.output=release-signed
```

The ordinary `bun run package` command intentionally remains unsigned. Local signed outputs are ignored by Git. The protected GitHub signing workflow requires its own secrets; local Keychain setup does not configure GitHub.

After notarization completes, verify the exact output:

```sh
codesign --verify --deep --strict --verbose=2 release-signed/mac-arm64/Rowberry.app
spctl --assess --type execute --verbose=2 release-signed/mac-arm64/Rowberry.app
xcrun stapler validate release-signed/mac-arm64/Rowberry.app
```

Run packaged regression tests against `release-signed/mac-arm64/Rowberry.app/Contents/MacOS/Rowberry` and follow the [release checklist](release-checklist.md). A successful signature or notarization does not establish application correctness or authorize public publication.

The build command notarizes the app. To also notarize the final DMG, sign it with the Developer ID identity, submit it with `xcrun notarytool submit PATH_TO_DMG --keychain-profile rowberry-notary --wait`, and check that Apple reports **Accepted**. Then run `xcrun stapler staple PATH_TO_DMG`, `xcrun stapler validate PATH_TO_DMG`, and `spctl --assess --type open --context context:primary-signature --verbose=2 PATH_TO_DMG`. Generate the checksum after stapling, since stapling changes the installer bytes.
