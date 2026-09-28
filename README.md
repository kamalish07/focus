# Focus — flip-clock study timer

A Focusmeter-style app for tracking how long you study each day. It installs on your phone
like a normal app, works offline, and keeps all data on your device.

**Open it:** <https://kamalish07.github.io/focus/>. On your phone, open the link and choose
*Install app* (Android) or *Share → Add to Home Screen* (iPhone).

**Google Play:** see [PLAY_STORE.md](PLAY_STORE.md). The store graphics and listing text are in `store/`.

## Features

- **Bottom tab bar:** Home · Stopwatch · Timer · Pomodoro · Stats. It becomes a side rail when
  the phone is sideways. Each mode keeps its own clock, and starting one pauses any other.
- **Home:** a big flip clock with the current time, the clock you're running, goal rings for
  today, streak, this week vs last week, a week chart, a consistency heatmap and recent sessions.
- **Flip clock** with real split-flap animation. Vertical on phones, horizontal in landscape.
- **Stopwatch, Timer and Pomodoro** modes. Time is measured from timestamps, so it stays
  correct when the phone sleeps or the app is closed.
- **Runs with the screen off:** while a clock runs, Focus plays an inaudible track (or brown,
  pink or white focus noise), so the phone keeps it awake. Alarms ring on time, and the lock
  screen shows the clock with play/pause.
- **Edit anything:** tap the clock (or ✎) to change the stopwatch time, the timer length, or
  the time left. Add, edit or delete past sessions in Statistics.
- **Categories** (Study, Math, Reading…) with colours and daily goals.
- **Statistics:** today vs goal, week/month/year charts, daily average, best day, streak,
  per-category breakdown and a session log.
- **Customise:** 10 themes plus custom colours, 10 digit fonts, digit size, corner roundness,
  hinge line, flip animation and sound, H·M·S / H·M / auto display, layout, alarm sounds,
  vibration, keep-screen-on, and auto-hiding buttons while you focus.
- **Backup / restore** (JSON) and **CSV export**.

## Put it on your phone

The app is a Progressive Web App (PWA). It needs to be served over **https** once. After that
you install it from the browser and it runs offline.

### Option A: GitHub Pages (free, permanent)
1. Create a new repository on GitHub and upload everything in this folder.
2. Open the repository's **Settings → Pages**, set *Source* to your `main` branch, then save.
3. After about a minute your app is live at `https://<your-username>.github.io/<repo>/`.

### Option B: Netlify Drop (no Git needed)
Drag this folder onto <https://app.netlify.com/drop> to get an https link.

### Install it
- **Android (Chrome):** open the link, then tap **Install app** (or ⋮ → *Add to Home screen*).
- **iPhone (Safari):** open the link, tap **Share** → **Add to Home Screen**.

Want a real Android `.apk` or Play Store build? Put your hosted link into
<https://www.pwabuilder.com> and it will package the app for you.

## Run it on your computer

**Easiest:** double-click `index.html`. It opens in your browser and works fully, and your
data is saved in that browser.

**Or with a local server** (lets phones on the same Wi-Fi try it too):

```bash
node tools/serve.mjs
```

Then open <http://localhost:5173>. Phones on the same Wi-Fi can use the address it prints.
Over plain http on a local network the app runs, but it can't be installed or work offline.

Opening the file and using the server keep **separate** data, because the browser treats
them as different sites.

## Changing the code

The source is the modules in `js/`. `index.html` loads `js/app.bundle.js`, a single file built
from them, so the app still works when opened straight from disk. After editing anything in
`js/`, rebuild it:

```bash
node tools/build.mjs
```

## Good to know

- Data lives in the browser storage of the device you use. Use **Settings → Back up**
  before switching phones, and **Restore** on the new one.
- **Screen off:** phones freeze web apps unless they're playing audio, which is why
  **Settings → Screen off & background** plays a track while a clock runs. "Silent" can't be
  heard, but it can pause music playing in another app. If you study with music, choose
  **Off**. The clock still catches up correctly when you come back, but the alarm won't ring
  while the screen is off.
- Allow notifications when asked, so a finished timer also shows an alert.
- This works best on Android (Chrome). iPhones are stricter with web apps, and background
  audio may stop when you switch apps.
- Installed copies check for updates each time they open with an internet connection. When
  you change files, also bump `VERSION` in `sw.js` so the offline copy is refreshed cleanly.
- Keyboard: **Space** start/pause · **R** reset · **E** edit.
