# Publishing Focus on Google Play

Focus goes on Play as a **Trusted Web Activity (TWA)**: a real Android app (an `.aab` file) that opens
https://kamalish07.github.io/focus/ full screen, with no browser bar, and installs from the Play Store like
any other app. Updates you push to GitHub reach Play users automatically, with no new upload needed.

## Ready now

- The app is live over https, works offline and passes the install checks.
- Icons, including the 512 × 512 Play icon, the feature graphic and 1080 × 1920 screenshots: see `store/`.
- Store text and answers for the "App content" forms: see `store/listing.md`.
- Privacy policy: https://kamalish07.github.io/focus/privacy.html

## 1. Create a Google Play developer account (you)

1. Go to https://play.google.com/console and sign up. There's a one-time US$25 fee and identity verification.
2. **New personal accounts must run a closed test first:** at least 12 testers opted in for 14 days in a row,
   before you can apply for production. Line up 12 friends with Android phones (they join through a link).

## 2. Build the Android package

**Option A: PWABuilder, in the browser, no installs (recommended)**
1. Open https://www.pwabuilder.com and enter `https://kamalish07.github.io/focus/`.
2. Choose **Package for stores → Android → Generate package** and set:
   - Package ID: `io.github.kamalish07.focus`
   - App name: `Focus: Flip Clock Study Timer`, launcher name: `Focus`
   - Version code `1`, version name `1.0.0`
   - Theme and background colour `#000000`, navigation bar colour `#000000`
   - Signing key: **Create new**
3. Download the zip. It contains the `.aab` to upload, a signing key and its passwords, and `assetlinks.json`.
   **Back up the signing key and passwords somewhere safe.** You need them for every future update.

**Option B: build it on this computer with Bubblewrap.** This needs Java 17 and the Android SDK (about 1 GB).
Claude can set it up and produce the same files.

## 3. Prove you own the website (Digital Asset Links)

Android only hides the browser bar if the website says "this app belongs to me". The `assetlinks.json` file
must be served from the **root** of the domain:

    https://kamalish07.github.io/.well-known/assetlinks.json

That root is your existing `kamalish07.github.io` repository. The file goes in `.well-known/assetlinks.json`,
together with an empty `.nojekyll` file so GitHub serves dot-folders. After your first upload, open
Play Console → **Test and release → App integrity → App signing** and add the **Google Play app signing
SHA-256** to the same file too. Play re-signs the app with that key.

## 4. Create the app in Play Console

1. **Create app** → name "Focus: Flip Clock Study Timer", App, Free.
2. **Store listing**: paste the text and upload the graphics from `store/`.
3. **App content**: privacy policy URL, ads (none), data safety (no data collected), content rating,
   target audience. The answers are in `store/listing.md`.
4. **Testing → Closed testing** → create a track, upload the `.aab`, add your testers' emails and share the
   opt-in link.
5. After 14 days with 12+ testers, apply for **Production** access, then release.

## Updating later

- Web changes (everything in this repo): push to GitHub. The Play app shows them on next launch.
- A new `.aab` is only needed to change the app's name, icon, package settings or Android version support.
  Rebuild with a higher version code, signed with the same key.
