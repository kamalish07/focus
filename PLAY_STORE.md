# Publishing Focus on Google Play

Focus goes on Play as a **Trusted Web Activity (TWA)**: a real Android app (an `.aab` file) that opens
https://kamalish07.github.io/focus/ full screen, with no browser bar, and installs from the Play Store like
any other app. Updates you push to GitHub reach Play users automatically, with no new upload needed.

- Package ID: `io.github.kamalish07.focus`, launcher name **Focus**, version 1.10.0 (version code 1)
- Store text and "App content" answers: `store/listing.md`
- Graphics: `store/` (512 × 512 icon, 1024 × 500 feature graphic, six 1080 × 1920 screenshots)
- Privacy policy: https://kamalish07.github.io/focus/privacy.html

## 1. Build the app (on this computer)

Everything is installed: Java 17 and the Android SDK live in `%USERPROFILE%\.bubblewrap`, and the Android
project in `C:\Users\kamal\FocusAndroid` (outside OneDrive, so builds don't sync). Copies of its
`twa-manifest.json` and `release.ps1` are kept in `android/` here.

Open a terminal and run:

    powershell -ExecutionPolicy Bypass -File C:\Users\kamal\FocusAndroid\release.ps1

The first time, it asks you to choose a password and creates your **upload key**,
`C:\Users\kamal\FocusAndroid\focus-upload.keystore`. Then it builds and signs the app and writes to
`C:\Users\kamal\FocusAndroid\release`:

| File | What it's for |
|---|---|
| `focus-1.10.0.aab` | Upload this to Play Console |
| `focus-1.10.0.apk` | Install on your own phone to try it |
| `assetlinks.json` | Proves to Android that the website belongs to the app |

**Back up `focus-upload.keystore` and its password** (for example OneDrive or a USB stick, and a password
manager). Every future update must be signed with it. Play App Signing is on by default, so a lost upload
key can be reset through Play support, but that takes days.

## 2. Link the website to the app (Digital Asset Links)

Android only hides the browser bar if the website lists the app's signing key. The file lives at the root
of the domain, in the `kamalish07.github.io` repository:

    https://kamalish07.github.io/.well-known/assetlinks.json

Claude publishes it from `release/assetlinks.json` once the key exists. After your first upload, copy the
**App signing key certificate SHA-256** from Play Console → **Test and release → App integrity → App
signing** and add it to the same file (Play re-signs the app with its own key, so both must be listed).

## 3. Create a Google Play developer account (you)

1. Go to https://play.google.com/console and sign up. There's a one-time US$25 fee and identity verification.
2. **New personal accounts must run a closed test first:** at least 12 testers opted in for 14 days in a row,
   before you can apply for production. Line up 12 friends with Android phones (they join through a link).

## 4. Create the app in Play Console

1. **Create app** → name "Focus: Flip Clock Study Timer", App, Free.
2. **Store listing**: paste the text and upload the graphics from `store/`.
3. **App content**: privacy policy URL, ads (none), data safety (no data collected), content rating,
   target audience. The answers are in `store/listing.md`.
4. **Test and release → Closed testing** → create a track, upload `focus-1.10.0.aab`, add your testers'
   emails and share the opt-in link.
5. After 14 days with 12+ testers, apply for **Production** access, then release.

## Updating later

- Web changes (everything in this repo): push to GitHub. The Play app shows them on next launch.
- A new `.aab` is only needed to change the app's name, icon, package settings or Android version support.
  Raise `appVersionCode` (and `appVersionName`) in `C:\Users\kamal\FocusAndroid\twa-manifest.json`,
  regenerate the project, and run `release.ps1` again with the same key.
