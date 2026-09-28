import { $, $$, pad, hms, clamp, fmtDur, fmtTime, luminance, MIN } from './util.js';
import { themeColors, fontById } from './config.js';
import { data, on, emit, saveSoon, currentCat, catById, dayKey, dayData, goalFor, sessionDur, DEMO } from './store.js';
import * as engine from './engine.js';
import * as audio from './audio.js';
import * as bg from './background.js';
import { FlipClock, fontMetrics, clearMetrics, sizeCards } from './flip.js';
import { icon, toast, dialog, overlayOpen, haptic, canVibrate } from './ui.js';
import { openEditor, openCategories } from './sheets.js';
import { mountStats } from './stats.js';
import { mountHome } from './home.js';
import { openSettings } from './settings.js';
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
const clock = new FlipClock(clockEl);
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
let metrics = null;
let tab = 'home';
const isModeTab = (t = tab) => engine.MODES.includes(t);

for (const el of $$('[data-icon]')) el.insertAdjacentHTML('afterbegin', icon(el.dataset.icon));

const home = mountHome($('.view-home'), { goTab: showTab, openSettings, togglePlay, visible: () => tab === 'home' });
const stats = mountStats($('.view-stats .stats'), { visible: () => tab === 'stats' });

/* ---------- appearance ---------- */

function applyTheme() {
  const t = themeColors(S());
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
  const f = fontById(S().font);
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
 * Size the timer's cards to fill the space available, in a row or a column.
 * In full-screen mode the cards may stretch further so they cover the whole screen.
 */
function fitClock() {
  const row = appEl.classList.contains('layout-row');
  const full = appEl.classList.contains('immersive');
  const n = Math.max(1, clock.cards.length);
  const W = clockEl.clientWidth;
  const H = clockEl.clientHeight;
  if (!W || !H || !metrics) return;
  let cw;
  let ch;
  let gap;
  if (row) {
    gap = clamp(W * 0.018, 6, 22);
    cw = (W - gap * (n - 1)) / n;
    ch = Math.min(H, cw * (full ? 1.3 : 1.02));
    cw = Math.min(cw, ch * (full ? 1.7 : 1.12));
  } else {
    gap = clamp(H * 0.022, 6, 18);
    ch = (H - gap * (n - 1)) / n;
    cw = Math.min(W, ch * (full ? 2.2 : 1.35));
    ch = Math.min(ch, cw * (full ? 1.35 : 1));
  }
  ch = Math.floor(ch / 2) * 2;
  sizeCards(clockEl, { cw: Math.floor(cw), ch, gap: Math.round(gap) }, metrics, S());
}

function fit() {
  applyOrientation();
  if (isModeTab()) fitClock();
  else if (tab === 'home') home.fit();
  emit('fit');
}

function applyAll() {
  applyTheme();
  document.body.classList.toggle('no-hinge', !S().hinge);
  audio.setVolume(S().volume);
  applyFont();
  if (tab === 'home') home.refresh();
  frame(true);
  updateWakeLock();
  poke();
}

/* ---------- tabs ---------- */

function showTab(t) {
  if (!TABS.includes(t)) t = 'home';
  tab = t;
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
  appEl.classList.remove('chrome-hidden', 'immersive');
  fit();
  if (t === 'home') home.refresh();
  if (t === 'stats') stats.refresh();
  frame(true);
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
  const countChanged = digits.length !== clock.cards.length;
  const animate = S().flip && !reduceMotion.matches && !force && !countChanged && !document.hidden;
  clock.render(digits, animate);
  if (countChanged) fitClock();
  const joined = `${m}|${digits.join(':')}`;
  if (!force && joined !== lastDigits && S().tick && engine.running(m) && !document.hidden) audio.tick();
  lastDigits = joined;

  const running = engine.running(m);
  if (playBtn.dataset.state !== String(running)) {
    playBtn.dataset.state = String(running);
    playBtn.innerHTML = icon(running ? 'pause' : 'play');
    playBtn.setAttribute('aria-label', running ? 'Pause' : 'Start');
  }
  skipBtn.hidden = m !== 'pomodoro';
  clockEl.classList.toggle('done', !!r.done);
  clockView.classList.toggle('is-break', m === 'pomodoro' && r.phase !== 'focus');

  const cat = catById(engine.current(m)?.cat || currentCat().id);
  $('#btn-cat .dot').style.setProperty('--c', cat.color);
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
  const savedTxt = (ev) => (ev.session && ev.kept ? `${fmtDur(sessionDur(ev.session))} of ${catById(ev.session.cat).name} saved` : '');

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
  if (info.kept) toast(`Saved ${fmtDur(sessionDur(s))} to ${catById(s.cat).name}`, undo);
  else toast(`Not saved — shorter than ${S().minSave}s`, undo);
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
for (const b of $$('[data-open-settings]')) b.addEventListener('click', openSettings);

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
});

/* ---------- full-screen clock while running ----------
   A few seconds after a clock starts, the buttons fade out and are then removed so the
   cards can grow to cover the screen. Tapping anywhere brings the options back. */

let hideTimer = 0;
let fullTimer = 0;
let sizingTimer = 0;
let swallowClick = false;

function setImmersive(on) {
  if (appEl.classList.contains('immersive') === on) return;
  if (!document.hidden && !reduceMotion.matches) clockEl.classList.add('sizing'); // animate the cards growing/shrinking
  appEl.classList.toggle('immersive', on);
  fit();
  clearTimeout(sizingTimer);
  sizingTimer = setTimeout(() => {
    clockEl.classList.remove('sizing');
    for (const a of clockEl.getAnimations()) if (a.transitionProperty) a.finish();
  }, 600);
}

function poke() {
  appEl.classList.remove('chrome-hidden');
  setImmersive(false);
  clearTimeout(hideTimer);
  clearTimeout(fullTimer);
  if (S().autoHide && isModeTab() && engine.running()) {
    hideTimer = setTimeout(() => {
      if (!isModeTab() || !engine.running() || overlayOpen()) return;
      appEl.classList.add('chrome-hidden');
      fullTimer = setTimeout(() => appEl.classList.contains('chrome-hidden') && setImmersive(true), 450);
    }, 3500);
  }
}

appEl.addEventListener('pointerdown', (e) => {
  swallowClick = appEl.classList.contains('chrome-hidden') && !e.target.closest('.controls');
  poke();
}, true);
appEl.addEventListener('click', (e) => {
  if (!swallowClick) return;
  swallowClick = false;
  e.stopPropagation();
  e.preventDefault();
}, true);
addEventListener('mousemove', () => appEl.classList.contains('chrome-hidden') && poke());

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
// Demo only (store screenshots): ?demo&scroll opens Home scrolled to the dashboard.
if (DEMO && new URLSearchParams(location.search).has('scroll')) {
  setTimeout(() => ($('.view-home').scrollTop = $('.home-bento').offsetTop - 14), 400);
}
setInterval(frame, 150);
initPWA();
