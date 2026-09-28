# Android (Play Store) build files

Copies, for safekeeping, of the files that define the Android app. The working project lives in
`C:\Users\kamal\FocusAndroid`, outside OneDrive so build output doesn't sync.

- `twa-manifest.json`: package ID, name, colours, icons, version and signing key location.
- `release.ps1`: creates the upload key on first run, then builds and signs the `.aab` and a test `.apk`,
  and writes `assetlinks.json`. Run it from `C:\Users\kamal\FocusAndroid`, not from here.

The signing key (`focus-upload.keystore`) is never stored in this repository. See `../PLAY_STORE.md`.
