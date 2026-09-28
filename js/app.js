import { $, $$, pad, hms, clamp, fmtDur, fmtTime, luminance, MIN } from './util.js';
import { themeColors, fontById } from './config.js';
import { data, on, emit, saveSoon, currentCat, catById, dayKey, dayData, goalFor, sessionDur, DEMO, shownLook, setTabScope } from './store.js';
import * as engine from './engine.js';
import * as audio from './audio.js';
import * as bg from './background.js';
import { fontMetrics, clearMetrics } from './flip.js';
import { makeFace } from './faces.js';
import { icon, toast, dialog, overlayOpen, haptic, canVibrate } from './ui.js';
import { openEditor, openCategories } from './sheets.js';
import { mountStats } from './stats.js';
import { mountHome } from './home.js';
import { openSettings } from './settings.js';
import { openLooks } from './looks.js';
import { openCustomize } from './customize.js';
import { initPWA, notify } from './pwa.js';

const TABS = ['home', 'stopwatch', 'timer', 'pomodoro', 'stats'];
const S = () => data.settings;
const appEl = $('#app');
const viewsEl = $('.views');
const clockView = $('.view-clock');
const clockEl = $('#clock');
const playBtn = $('#btn-play');
const skipBtn = $('#btn-skip');
const infoLeft = $('#info-left');
const infoRight = $('#info-right');
const progress = $('#progress');
const fullBtn = $('#btn-full');
let face = makeFace(clockEl, data.settings.face);
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
let metrics = null;
let tab = 'home';
let started = false; // no transitions during the first paint
const isModeTab = (t = tab) => engine.MODES.includes(t);

for (const el of $$('[data-icon]')) el.insertAdjacentHTML('afterbegin', icon(el.dataset.icon));

const home = mountHome($('.view-home'), { goTab: showTab, openSettings: () => openSettings(), openLooks: () => showLooks('home'), togglePlay, visible: () => tab === 'home' });
const stats = mountStats($('.view-stats .stats'), { visible: () => tab === 'stats' });

/* ---------- appearance ---------- */

/** The look on screen: Home's own on Home (when it has one), the timers' everywhere else. */
const L = () => shownLook();

function applyTheme() {
  const t = themeColors(L());
  const st = document.documentElement.style;
  st.setProperty('--bg', t.bg);
  st.setProperty('--card', t.card);
  st.setProperty('--digit', t.digit);
  st.setProperty('--accent', t.accent);
  st.setProperty('--on-accent', luminance(t.accent) > 0.4 ? '#111111' : '#ffffff');
  st.background = t.bg;
  document.documentElement.dataset.scheme = luminance(t.bg) > 0.35 ? 'light' : 'dark';
  $('meta[name="theme-color"]').setAttribute('content', t.bg);
  try {
    if (!DEMO) localStorage.setItem('focus.bg', t.bg);
  } catch {}
}

function applyFont() {
  const f = fontById(L().font);
  const st = document.documentElement.style;
  st.setProperty('--digit-font', f.family);
  st.setProperty('--digit-weight', f.weight);
  st.setProperty('--ls', `${f.ls || 0}em`);
  metrics = fontMetrics(f);
  fit();
  document.fonts?.load(`${f.weight} 100px ${f.family}`, '0123456789').then(() => {
    clearMetrics();
    metrics = fontMetrics(f);
    fit();
  }, () => {});
}

function applyOrientation() {
  const landscape = innerWidth > innerHeight;
  const row = S().layout === 'row' ? true : S().layout === 'col' ? false : landscape;
  appEl.classList.toggle('landscape', landscape);
  appEl.classList.toggle('layout-row', row);
  appEl.classList.toggle('layout-col', !row);
}

/**
 * Size the clock face to fill the space available, in a row or a column.
 * In full-screen mode it may stretch further so it covers the whole screen.
 */
function fitClock() {
  const W = clockEl.clientWidth;
  const H = clockEl.clientHeight;
  if (!W || !H || !metrics) return;
  face.fit({ W, H, row: appEl.classList.contains('layout-row'), stretch: appEl.classList.contains('immersive') });
}

function fit() {
  applyOrientation();
  if (isModeTab()) fitClock();
  else if (tab === 'home') home.fit();
  emit('fit');
}

/** Style options live on <html> so the clock, Home and Settings previews all pick them up. */
function applyLook() {
  const s = L();
  const html = document.documentElement;
  if (s.faceColor && s.faceColor !== 'auto') html.style.setProperty('--face', s.faceColor);
  else html.style.removeProperty('--face');
  html.style.setProperty('--glow', String(s.glow ?? 0.6));
  html.classList.toggle('no-ghost', s.ghost === false);
  html.classList.toggle('no-ticks', s.ticks === false);
  html.classList.toggle('no-blink', s.blink === false);
  html.classList.toggle('card-shade', !!s.shade);
  for (const b of ['glow', 'gradient']) html.classList.toggle(`bd-${b}`, s.backdrop === b);
}

function applyAll() {
  if (face.type !== S().face) {
    face = makeFace(clockEl, S().face);
    lastDigits = '';
  }
  applyTheme();
  applyLook();
  appEl.classList.toggle('show-info', !!S().showInfo);
  document.body.classList.toggle('no-hinge', !L().hinge);
  audio.setVolume(S().volume);
  applyFont();
  if (tab === 'home') home.refresh();
  frame(true);
  updateWakeLock();
  poke();
}

/* ---------- tabs ---------- */

/** Tab changes cross-fade where the browser supports view transitions. */
function showTab(t) {
  const animate = started && t !== tab && document.startViewTransition && !reduceMotion.matches && !document.hidden;
  if (animate) document.startViewTransition(() => swapTab(t)).ready.catch(() => {}); // a skipped fade is fine
  else swapTab(t);
}

function swapTab(t) {
  if (!TABS.includes(t)) t = 'home';
  tab = t;
  const restyle = setTabScope(t === 'home' ? 'home' : 'main'); // Home may wear a look of its own
  if (isModeTab(t)) engine.setView(t);
  $('.view-home').hidden = t !== 'home';
  clockView.hidden = !isModeTab(t);
  $('.view-stats').hidden = t !== 'stats';
  for (const b of $$('.tabbar [data-tab]')) {
    const sel = b.dataset.tab === t;
    b.setAttribute('aria-selected', String(sel));
    b.tabIndex = sel ? 0 : -1;
  }
  try {
    if (!DEMO) localStorage.setItem('focus.tab', t);
  } catch {}
  appEl.classList.remove('chrome-hidden', 'immersive', 'overlay-on');
  syncFullButton();
  suppressAuto = false;
  if (restyle) applyAll();
  else {
    fit();
    if (t === 'home') home.refresh();
    frame(true);
  }
  if (t === 'stats') stats.refresh();
  poke();
  if (isModeTab(t) && !S().seenTip) {
    S().seenTip = true;
    saveSoon();
    setTimeout(() => toast('Tip: tap the clock to edit the time', { ms: 4500 }), 700);
  }
}

$('.tabbar').addEventListener('click', (e) => {
  const b = e.target.closest('[data-tab]');
  if (!b || b.dataset.tab === tab) return;
  haptic(6);
  showTab(b.dataset.tab);
});

let tabsKey = '';
function updateTabs() {
  const a = engine.active();
  const key = `${a}|${engine.MODES.filter((m) => engine.hasProgress(m)).join()}`;
  if (key === tabsKey) return;
  tabsKey = key;
  for (const b of $$('.tabbar [data-tab]')) {
    const m = b.dataset.tab;
    b.classList.toggle('live', m === a);
    b.classList.toggle('paused', m !== a && engine.MODES.includes(m) && engine.hasProgress(m));
  }
}

/* ---------- rendering ---------- */

function digitsFor(ms, countdown) {
  const f = S().format;
  if (f === 'hm') {
    const total = countdown ? Math.ceil(ms / MIN) : Math.floor(ms / MIN);
    return [pad(Math.floor(total / 60)), pad(total % 60)];
  }
  const [h, m, s] = hms(ms, countdown);
  if (f === 'auto' && h === 0) return [pad(m), pad(s)];
  return [pad(h), pad(m), pad(s)];
}

const setText = (el, text) => {
  if (el.textContent !== text) el.textContent = text;
};

let lastDigits = '';

function renderClock(now, force) {
  const m = engine.view();
  const r = engine.runner(m);
  const digits = digitsFor(engine.displayMs(m, now), engine.isCountdown(m));
  const countChanged = digits.length !== face.count;
  const animate = !reduceMotion.matches && !force && !countChanged && !document.hidden;
  const running = engine.running(m);
  // Ring progress: a countdown empties as time runs out; the stopwatch sweeps once a minute.
  const prog = m === 'stopwatch' ? (engine.elapsed(m, now) % MIN) / MIN : r.dur ? engine.remaining(m, now) / r.dur : 0;
  const cat = catById(engine.current(m)?.cat || currentCat().id);
  const label = m === 'pomodoro' ? (r.phase === 'focus' ? `Focus ${r.round}/${S().pomo.every}` : engine.phaseName()) : cat.none ? '' : cat.name;
  face.render(digits, { animate, running, progress: prog, label, ms: engine.displayMs(m, now) });
  if (countChanged) fitClock();
  const joined = `${m}|${digits.join(':')}`;
  if (!force && joined !== lastDigits && S().tick && running && !document.hidden) audio.tick();
  lastDigits = joined;

  if (playBtn.dataset.state !== String(running)) {
    playBtn.dataset.state = String(running);
    playBtn.innerHTML = icon(running ? 'pause' : 'play');
    playBtn.setAttribute('aria-label', running ? 'Pause' : 'Start');
  }
  skipBtn.hidden = m !== 'pomodoro';
  clockEl.classList.toggle('done', !!r.done);
  clockView.classList.toggle('is-break', m === 'pomodoro' && r.phase !== 'focus');

  $('#btn-cat .dot').style.setProperty('--c', cat.color);
  $('#btn-cat').classList.toggle('none', !!cat.none);
  setText($('#btn-cat .pill-name'), cat.name);

  const catToday = dayData(dayKey(now), now).cats[cat.id] || 0;
  let left;
  if (m === 'stopwatch') {
    const s = engine.current(m);
    if (S().display === 'today') left = s ? `Session ${fmtDur(sessionDur(s, now))}` : 'Today’s total';
    else left = s ? `Started ${fmtTime(s.start)}` : 'Stopwatch';
  } else if (m === 'timer') {
    left = r.done ? 'Time’s up' : running ? `Ends ${fmtTime(now + engine.remaining(m, now))}` : `${fmtDur(r.dur)} timer`;
  } else {
    left = r.phase === 'focus' ? `Focus ${r.round} of ${S().pomo.every}` : engine.phaseName();
    if (running) left += ` · ends ${fmtTime(now + engine.remaining(m, now))}`;
  }
  const goal = goalFor(cat.id);
  setText(infoLeft, left);
  setText(infoRight, `Today ${fmtDur(catToday)}${goal ? ` / ${fmtDur(goal)}` : ''}`);
  progress.hidden = !goal;
  if (goal) {
    const bar = progress.firstElementChild;
    const w = `${Math.min(100, (catToday / goal) * 100)}%`;
    if (bar.style.width !== w) bar.style.width = w;
    bar.style.background = cat.color;
  }
}

/** " of Study" for messages; nothing when the session has no category. */
const inCat = (s) => (catById(s.cat).none ? '' : ` of ${catById(s.cat).name}`);

function frame(force = false) {
  const now = Date.now();
  const events = engine.tick(now);
  if (events.length) handleFinish(events);
  if (isModeTab()) renderClock(now, force);
  else if (tab === 'home') home.tick(now, !force && !document.hidden && !reduceMotion.matches);
  updateTabs();
  const a = engine.active();
  document.title = a ? `${digitsFor(engine.displayMs(a, now), engine.isCountdown(a)).join(':')} · Focus` : 'Focus';
  bg.sync(now);
}

/* ---------- finished timers ---------- */

function handleFinish(events) {
  const last = events[events.length - 1];
  const quiet = last.late > 90 * 1000; // finished long ago while the app was closed
  if (!quiet) {
    audio.alarm(S().sound, document.hidden ? 10 : last.mode === 'timer' ? 4 : 2);
    bg.hold(30 * 1000); // keep the app awake while the alarm rings
    if (S().vibrate && canVibrate() && !document.hidden) navigator.vibrate([250, 120, 250, 120, 400]);
  }
  const savedTxt = (ev) => (ev.session && ev.kept ? `${fmtDur(sessionDur(ev.session))}${inCat(ev.session)} saved` : '');

  if (last.mode === 'timer') {
    const logged = savedTxt(last) || (last.session ? `Too short to log (under ${S().minSave}s)` : '');
    const msg = [logged, quiet ? `Finished at ${fmtTime(last.at)}` : ''].filter(Boolean).join(' · ');
    if (document.hidden && !quiet) notify('Time’s up', msg || 'Your timer has finished.', true);
    dialog({
      title: 'Time’s up',
      message: msg,
      buttons: [
        { label: '+5 min', value: 'more' },
        { label: 'Done', value: 'done', primary: true },
      ],
      dismissValue: 'done',
    }).then((v) => {
      audio.stopAlarm();
      bg.hold(0);
      if (v === 'more') {
        audio.unlock();
        engine.startExtra(5 * MIN);
        bg.kick();
      } else if (engine.runner('timer').done) engine.reset('timer');
    });
    return;
  }
  const focusDone = events.filter((e) => e.phase === 'focus');
  const text =
    last.phase === 'focus'
      ? `Focus done${savedTxt(last) ? ` · ${savedTxt(last)}` : ''}. Time for a ${engine.runner('pomodoro').phase === 'long' ? 'long' : 'short'} break.`
      : 'Break’s over. Back to focus!';
  if (document.hidden && !quiet) notify(last.phase === 'focus' ? 'Focus complete' : 'Break over', text);
  toast(focusDone.length > 1 ? `${focusDone.length} focus rounds finished while you were away.` : text, { ms: 5000 });
}

/* ---------- controls ---------- */

function askNotifications(m) {
  if (!engine.isCountdown(m) || S().askedNotif || !('Notification' in window) || Notification.permission !== 'default' || location.protocol === 'file:') return;
  S().askedNotif = true;
  saveSoon();
  setTimeout(
    () => toast('Get an alert when time’s up, even with the screen off?', { action: 'Allow', onAction: () => Notification.requestPermission().catch(() => {}) }),
    700
  );
}

function togglePlay(m = engine.view()) {
  audio.unlock();
  haptic(10);
  if (engine.running(m)) {
    engine.pause(m);
    return;
  }
  const r = engine.runner(m);
  if (engine.isCountdown(m) && !r.done && engine.remaining(m) <= 0) {
    if (isModeTab()) openEditor();
    return;
  }
  suppressAuto = false;
  const res = engine.play(m);
  bg.kick();
  if (res?.paused.length) toast(`${engine.modeName(res.paused[0])} paused`);
  askNotifications(m);
}

function onReset() {
  const m = engine.view();
  haptic(10);
  const r = engine.runner(m);
  if (r.done) return engine.reset(m);
  const had = engine.hasProgress(m);
  const info = engine.reset(m);
  if (!had) {
    if (m === 'pomodoro') toast('Pomodoro cycle restarted');
    return;
  }
  const s = info.session;
  if (!s) return;
  const undo = { action: 'Undo', onAction: () => engine.undoReset(info) };
  if (info.kept) toast(`Saved ${fmtDur(sessionDur(s))}${catById(s.cat).none ? '' : ` to ${catById(s.cat).name}`}`, undo);
  else toast(`Too short to save (under ${S().minSave}s)`, undo);
}

playBtn.addEventListener('click', () => togglePlay());
$('#btn-reset').addEventListener('click', onReset);
$('#btn-edit').addEventListener('click', openEditor);
clockEl.addEventListener('click', openEditor);
skipBtn.addEventListener('click', () => {
  haptic(10);
  const res = engine.skip();
  toast(`${engine.phaseName()}${res.session && res.kept ? ` · saved ${fmtDur(sessionDur(res.session))}` : ''}`);
});
$('#btn-cat').addEventListener('click', openCategories);
for (const b of $$('[data-open-settings]')) b.addEventListener('click', () => openSettings());
for (const b of $$('[data-open-looks]')) b.addEventListener('click', () => showLooks('main'));

/** The palette on Home edits Home's look (its own, when it has one); on the clock screen, the timers'. */
function showLooks(which = 'main') {
  haptic(6);
  openLooks({
    which,
    onMore: () => openCustomize({ which: which === 'home' && S().homeLook ? 'home' : 'main' }),
    onHome: () => openCustomize({ which: 'home' }),
  });
}

document.addEventListener('keydown', (e) => {
  if (overlayOpen() || e.target.closest('input, textarea, select') || e.ctrlKey || e.metaKey || e.altKey) return;
  const n = Number(e.key);
  if (n >= 1 && n <= TABS.length) return showTab(TABS[n - 1]);
  if (!isModeTab()) return;
  if (e.code === 'Space' || e.key === 'k') {
    e.preventDefault();
    togglePlay();
  } else if (e.key === 'r') onReset();
  else if (e.key === 'e') openEditor();
  else if (e.key === 'f') toggleFull();
  else if (e.key === 'Escape' && isFull()) toggleFull();
});

/* ---------- full-screen clock ----------
   A few seconds after a clock starts (or when you tap the full-screen button) everything
   but the clock is removed and the face grows to cover the screen. From then on the
   controls float over the clock like a video player: tap to show them, and they fade
   away again while the clock runs. Nothing underneath moves. */

let hideTimer = 0;
let fullTimer = 0;
let overlayTimer = 0;
let sizingTimer = 0;
let swallowClick = false;
let suppressAuto = false; // you left full screen yourself: don't re-enter until the next start

const isFull = () => appEl.classList.contains('immersive');

function syncFullButton() {
  const full = isFull();
  if (fullBtn.dataset.full === String(full)) return;
  fullBtn.dataset.full = String(full);
  fullBtn.innerHTML = icon(full ? 'collapse' : 'expand');
  fullBtn.setAttribute('aria-label', full ? 'Exit full screen' : 'Full screen');
  fullBtn.title = full ? 'Exit full screen (F)' : 'Full screen (F)';
}

function setImmersive(on) {
  if (isFull() === on) return;
  if (!document.hidden && !reduceMotion.matches) clockEl.classList.add('sizing'); // animate the face growing/shrinking
  appEl.classList.remove('chrome-hidden');
  appEl.classList.toggle('immersive', on);
  if (!on) appEl.classList.remove('overlay-on');
  syncFullButton();
  fit();
  clearTimeout(sizingTimer);
  sizingTimer = setTimeout(() => {
    clockEl.classList.remove('sizing');
    for (const a of clockEl.getAnimations()) if (a.transitionProperty) a.finish();
  }, 600);
}

/** Show or hide the floating controls in full screen. They stay while the clock is stopped. */
function showOverlay(on) {
  appEl.classList.toggle('overlay-on', on);
  clearTimeout(overlayTimer);
  if (on && engine.running()) overlayTimer = setTimeout(() => !overlayOpen() && showOverlay(false), 3200);
}

/** Outside full screen: fade the buttons, then go full screen after a few idle seconds. */
function scheduleAuto() {
  clearTimeout(hideTimer);
  clearTimeout(fullTimer);
  if (!S().autoHide || suppressAuto || !isModeTab() || !engine.running() || isFull()) return;
  hideTimer = setTimeout(() => {
    if (!isModeTab() || !engine.running() || overlayOpen()) return;
    appEl.classList.add('chrome-hidden');
    fullTimer = setTimeout(() => appEl.classList.contains('chrome-hidden') && setImmersive(true), 450);
  }, 3500);
}

function poke() {
  if (isFull()) {
    if (!isModeTab()) setImmersive(false);
    else showOverlay(true);
    return;
  }
  appEl.classList.remove('chrome-hidden');
  scheduleAuto();
}

function toggleFull() {
  haptic(6);
  if (isFull()) {
    suppressAuto = true;
    setImmersive(false);
    scheduleAuto();
  } else {
    setImmersive(true);
    showOverlay(true);
  }
}
fullBtn.addEventListener('click', toggleFull);

appEl.addEventListener('pointerdown', (e) => {
  swallowClick = false;
  if (isFull()) {
    const onControl = e.target.closest('.topbar button, .controls');
    if (!appEl.classList.contains('overlay-on')) {
      swallowClick = true; // first tap only reveals the controls
      showOverlay(true);
    } else if (!onControl) {
      swallowClick = true; // tap on the clock hides them again
      showOverlay(false);
    } else showOverlay(true);
    return;
  }
  swallowClick = appEl.classList.contains('chrome-hidden') && !e.target.closest('.controls');
  poke();
}, true);
appEl.addEventListener('click', (e) => {
  if (!swallowClick) return;
  swallowClick = false;
  e.stopPropagation();
  e.preventDefault();
}, true);
// Real mouse movement only: phones send a fake mouse event after every tap, which would
// otherwise re-show the controls a tap just hid.
addEventListener('pointermove', (e) => {
  if (e.pointerType !== 'mouse') return;
  if (isFull()) showOverlay(true);
  else if (appEl.classList.contains('chrome-hidden')) poke();
});

/* ---------- keep the screen awake while the app is open ---------- */

let wakeLock = null;
let wakePending = false;

async function updateWakeLock() {
  const want = S().wakeLock && !!engine.active() && !document.hidden;
  if (want && !wakeLock && !wakePending && 'wakeLock' in navigator) {
    wakePending = true;
    try {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => (wakeLock = null));
    } catch {}
    wakePending = false;
  } else if (!want && wakeLock) {
    wakeLock.release().catch(() => {});
    wakeLock = null;
  }
}

/* ---------- wiring ---------- */

on('settings', applyAll);
on('change', () => {
  frame();
  if (tab === 'home') home.refresh();
});
on('runner', () => {
  updateWakeLock();
  poke();
  bg.sync();
});

document.addEventListener('visibilitychange', () => {
  if (!document.hidden) {
    fit();
    frame(true);
    if (tab === 'home') home.refresh();
  }
  updateWakeLock();
});

let fitTimer = 0;
const refit = () => {
  clearTimeout(fitTimer);
  fitTimer = setTimeout(fit, 30);
};
new ResizeObserver(refit).observe(viewsEl);
addEventListener('resize', refit);

document.fonts?.addEventListener?.('loadingdone', () => {
  clearMetrics();
  metrics = fontMetrics(fontById(S().font));
  fit();
});
$('#font-css')?.addEventListener('load', () => applyFont());

// Browsers only allow sound after a tap, so restart background audio on the first one.
document.addEventListener('pointerdown', () => {
  audio.unlock();
  bg.kick();
}, { once: true, capture: true });

// Home refreshes its dashboard every minute so today's numbers stay live.
setInterval(() => tab === 'home' && !document.hidden && home.refresh(), 60 * 1000);

let startTab = location.hash.slice(1);
if (location.hash) history.replaceState(null, '', location.pathname + location.search);
if (!TABS.includes(startTab)) {
  let saved = null;
  try {
    saved = localStorage.getItem('focus.tab');
  } catch {}
  startTab = engine.active() || saved || 'home';
}
applyTheme();
showTab(startTab);
applyAll();
// From now on theme colours fade instead of snapping (after the first paint, so launch doesn't fade in).
setTimeout(() => {
  document.documentElement.classList.add('theme-anim');
  started = true;
}, 120);
// Demo only (store screenshots): ?demo&scroll opens Home scrolled to the dashboard.
if (DEMO && new URLSearchParams(location.search).has('scroll')) {
  setTimeout(() => ($('.view-home').scrollTop = $('.home-bento').offsetTop - 14), 400);
}
// Demo only: ?demo&tap shows the full-screen controls once full screen has kicked in.
if (DEMO && new URLSearchParams(location.search).has('tap')) setTimeout(() => isFull() && showOverlay(true), 5500);
if (DEMO) {
  const q = new URLSearchParams(location.search);
  if (q.has('settings')) setTimeout(() => openSettings(), 300);
  if (q.has('customize')) setTimeout(() => openCustomize(), 300);
  if (q.has('homelook')) setTimeout(() => openCustomize({ which: 'home' }), 300);
  if (q.has('looks')) setTimeout(() => showLooks(q.get('looks') === 'home' ? 'home' : 'main'), 300);
}
setInterval(frame, 150);
initPWA();
