import { PALETTE, TEMPLATES, LOOK_DEFAULTS, LOOK_KEYS } from './config.js';
import { MIN, pad } from './util.js';

const KEY = 'focus.v1';

/** Time can be logged without a category; it's grouped under this id. */
export const NONE = 'none';

/** Everything that makes up a look (a template's worth, plus which template it came from). */
const LOOK_FIELDS = [...LOOK_KEYS, 'template'];

export const DEFAULT_SETTINGS = {
  theme: 'classic',
  custom: { bg: '#000000', card: '#121212', digit: '#b3b3b3', accent: '#d4e157' },
  face: 'flip', // see FACES in faces.js (stopwatch, timer and Pomodoro)
  homeLook: null, // Home's own look (template, theme, style, font…), or null to match the timers
  template: 'classic', // last template applied; null once you customise
  faceColor: 'auto',
  glow: 0.6,
  ghost: true,
  ticks: true,
  blink: true,
  flipSpeed: 'normal',
  shade: false,
  backdrop: 'none',
  aurora: 'ocean',
  font: 'barlow',
  digitScale: 1,
  radius: 0.09,
  hinge: true,
  flip: true,
  tick: false,
  format: 'auto', // auto (MM SS until the first hour, then HH MM SS) | hms | hm
  display: 'session', // session | today (what the stopwatch shows)
  layout: 'auto', // auto | row | col
  autoHide: true,
  wakeLock: true,
  timerDur: 25 * MIN,
  pomo: { focus: 25, short: 5, long: 15, every: 4, autoBreak: true, autoFocus: false },
  sound: 'chime',
  volume: 0.8,
  vibrate: true,
  goal: 0, // daily goal in minutes, all categories together; 0 = no goal
  weekStart: 1,
  dayStart: 0, // hour a new "day" begins, for night owls
  minSave: 30, // seconds; shorter sessions are not kept
  cat: 'study', // current category, or NONE to log without one
  seenTip: false,
  showInfo: false, // the line under the clock (start time, today's total)
  bgSound: 'silent', // off | silent | brown | pink | white; keeps the app alive with the screen off
  ambientVol: 0.5,
  clock24: null, // null = follow the phone's setting
  clockSeconds: false,
  askedNotif: false,
};

export const MODES = ['stopwatch', 'timer', 'pomodoro'];

/**
 * A runner is one live clock (each mode has its own). `acc` is time counted in closed
 * segments, `runStart` is set while running. The session it feeds (`sid`) lives in
 * data.sessions from the moment you press play.
 */
export function freshRunner(mode = 'stopwatch', s = DEFAULT_SETTINGS) {
  return {
    mode,
    phase: 'focus',
    round: 1,
    acc: 0,
    runStart: null,
    sid: null,
    done: false,
    dur: mode === 'timer' ? s.timerDur : s.pomo.focus * MIN,
  };
}

function defaults() {
  return {
    v: 5,
    settings: structuredClone(DEFAULT_SETTINGS),
    cats: [{ id: 'study', name: 'Study', color: PALETTE[0], goal: 0 }], // goals are optional
    sessions: [],
    runners: Object.fromEntries(MODES.map((m) => [m, freshRunner(m)])),
  };
}

function normalize(d) {
  const def = defaults();
  if (!d || typeof d !== 'object') return def;
  const settings = { ...def.settings, ...(d.settings || {}) };
  // Version 3: clocks start as MM SS and add the hours card after an hour.
  if ((d.v || 1) < 3 && settings.format === 'hms') settings.format = 'auto';
  // Version 4: goals are opt-in. Clear the 3-hour goal that used to be set by default (only if untouched).
  if ((d.v || 1) < 4) for (const c of d.cats || []) if (c && c.id === 'study' && c.goal === 180) c.goal = 0;
  // Version 5: the daily goal is one explicit total. Keep what the category goals used to add up to.
  if ((d.v || 1) < 5 && !settings.goal) settings.goal = (d.cats || []).reduce((a, c) => a + (c?.goal || 0), 0);
  settings.pomo = { ...def.settings.pomo, ...(d.settings?.pomo || {}) };
  settings.custom = { ...def.settings.custom, ...(d.settings?.custom || {}) };
  // 1.9.0 let Home pick just a clock style; that becomes Home's own look.
  if (settings.homeFace && settings.homeFace !== 'same' && !settings.homeLook) settings.homeLook = { ...copyLook(settings), face: settings.homeFace, template: null };
  delete settings.homeFace;
  if (settings.homeLook && typeof settings.homeLook !== 'object') settings.homeLook = null;
  // Categories are optional: an empty list is fine (everything is then "No category").
  const cats = Array.isArray(d.cats) ? d.cats.filter((c) => c && c.id && c.id !== NONE) : def.cats;
  if (settings.cat !== NONE && !cats.some((c) => c.id === settings.cat)) settings.cat = cats[0]?.id || NONE;
  const sessions = Array.isArray(d.sessions) ? d.sessions.filter((s) => s && s.id && Array.isArray(s.segs)) : [];
  const ids = new Set(sessions.map((s) => s.id));

  const runners = {};
  for (const m of MODES) runners[m] = { ...freshRunner(m, settings), ...(d.runners?.[m] || {}), mode: m };
  // Data from version 1 had a single shared runner.
  if (d.runner && !d.runners && MODES.includes(d.runner.mode)) Object.assign(runners[d.runner.mode], d.runner);
  let oneRunning = false;
  for (const m of MODES) {
    const r = runners[m];
    if (r.sid && !ids.has(r.sid)) r.sid = null;
    if (r.runStart != null) {
      if (oneRunning) r.runStart = null; // only one clock may run at a time
      oneRunning = true;
    }
  }
  // Only a running runner's own session may be "running".
  const live = new Set(MODES.map((m) => runners[m]).filter((r) => r.runStart != null && r.sid).map((r) => r.sid));
  for (const s of sessions) {
    if (s.run != null && !live.has(s.id)) {
      s.segs.push([s.run, s.run]);
      s.run = null;
    }
  }
  return { v: 5, settings, cats, sessions, runners };
}

/** `?demo` in the URL shows sample data (used for store screenshots) and never saves anything. */
export const DEMO = new URLSearchParams(location.search).has('demo');

function demoData() {
  const d = defaults();
  Object.assign(d.settings, { seenTip: true, askedNotif: true });
  const face = new URLSearchParams(location.search).get('face');
  if (face) d.settings.face = face;
  const tpl = TEMPLATES.find((t) => t.id === new URLSearchParams(location.search).get('tpl'));
  if (tpl) Object.assign(d.settings, LOOK_DEFAULTS, tpl.look, { template: tpl.id });
  const homeTpl = TEMPLATES.find((t) => t.id === new URLSearchParams(location.search).get('hometpl'));
  if (homeTpl) d.settings.homeLook = { ...copyLook(d.settings), ...LOOK_DEFAULTS, ...homeTpl.look, template: homeTpl.id };
  const noGoal = new URLSearchParams(location.search).has('nogoal');
  d.cats = [
    { id: 'study', name: 'Study', color: PALETTE[0], goal: 180 },
    { id: 'math', name: 'Math', color: PALETTE[1], goal: 60 },
    { id: 'read', name: 'Reading', color: PALETTE[2], goal: 30 },
  ];
  if (noGoal) for (const c of d.cats) c.goal = 0;
  else d.settings.goal = 240;
  let seed = 7;
  const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
  const today = new Date();
  for (let back = 1; back <= 150; back++) {
    if (rnd() < 0.18) continue;
    let t = new Date(today.getFullYear(), today.getMonth(), today.getDate() - back, 9).getTime();
    for (const c of d.cats) {
      if (rnd() < 0.3) continue;
      const dur = Math.round((20 + rnd() * (c.id === 'study' ? 160 : 50)) * MIN);
      d.sessions.push({ id: `d${back}${c.id}`, cat: c.id, mode: ['stopwatch', 'timer', 'pomodoro'][Math.floor(rnd() * 3)], start: t, segs: [[t, t + dur]], adj: 0, run: null, note: '' });
      t += dur + 40 * MIN;
    }
  }
  const n = Date.now();
  d.sessions.push({ id: 'dt1', cat: 'study', mode: 'pomodoro', start: n - 200 * MIN, segs: [[n - 200 * MIN, n - 150 * MIN]], adj: 0, run: null, note: 'Organic chemistry' });
  d.sessions.push({ id: 'dt2', cat: 'math', mode: 'timer', start: n - 130 * MIN, segs: [[n - 130 * MIN, n - 85 * MIN]], adj: 0, run: null, note: 'Problem set 4' });
  const st = n - 47 * MIN - 12000;
  d.sessions.push({ id: 'dlive', cat: 'study', mode: 'stopwatch', start: st, segs: [], adj: 0, run: st, note: '' });
  Object.assign(d.runners.stopwatch, { runStart: st, sid: 'dlive', touched: st });
  return d;
}

function load() {
  if (DEMO) return normalize(demoData());
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return normalize(JSON.parse(raw));
  } catch (e) {
    console.warn('Focus: could not read saved data', e);
  }
  return defaults();
}

// Never reassigned (replaced in place), so every module can hold on to it.
export const data = load();

function setData(obj) {
  for (const k of Object.keys(data)) delete data[k];
  Object.assign(data, obj);
  save();
}

/* ---------- looks: the timers' look, and optionally one of Home's own ---------- */

/** The look-related part of a settings object (a fresh copy). */
export function copyLook(src) {
  const out = {};
  for (const k of LOOK_FIELDS) if (src[k] !== undefined) out[k] = k === 'custom' ? { ...src[k] } : src[k];
  return out;
}

/** Settings with a look laid over them: 'home' uses Home's own look when it has one. */
export const lookOf = (which) => (which === 'home' && data.settings.homeLook ? { ...data.settings, ...data.settings.homeLook } : data.settings);

/** Where changes to that look are written. */
export const lookTarget = (which) => (which === 'home' && data.settings.homeLook ? data.settings.homeLook : data.settings);

// Which look the app wears right now: the tab's (Home or the timers), unless a page that edits
// a look is open on top, in which case that page's look, so what you see is what you edit.
const scopes = [];
let tabScope = 'main';
export const lookScope = () => (scopes.length ? scopes[scopes.length - 1].which : tabScope);
export const shownLook = () => lookOf(lookScope());
/** Returns true when the switch changes what the app should look like. */
export function setTabScope(which) {
  const before = lookScope();
  tabScope = which;
  return before !== lookScope() && !!data.settings.homeLook;
}
/** Show `which` look while a page is open; returns the function that stops. */
export function pushScope(which) {
  const token = { which };
  scopes.push(token);
  emit('settings');
  return () => {
    const i = scopes.indexOf(token);
    if (i < 0) return;
    scopes.splice(i, 1);
    emit('settings');
  };
}

/* ---------- events ---------- */

const listeners = {};
export function on(evt, fn) {
  (listeners[evt] ||= []).push(fn);
  return () => {
    listeners[evt] = listeners[evt].filter((f) => f !== fn);
  };
}
export const emit = (evt, arg) => (listeners[evt] || []).slice().forEach((fn) => fn(arg));

/* ---------- persistence ---------- */

let saveTimer = 0;
export function save() {
  clearTimeout(saveTimer);
  cache = null;
  try {
    if (!DEMO) localStorage.setItem(KEY, JSON.stringify(data));
  } catch (e) {
    console.warn('Focus: could not save', e);
  }
  emit('change');
}

/** Debounced save for rapid-fire settings changes (sliders, colour pickers). */
export function saveSoon() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(save, 400);
}

export const replaceAll = (obj) => setData(normalize(obj));
export const resetAll = () => setData(defaults());

/* ---------- categories ---------- */

const NO_CAT = Object.freeze({ id: NONE, name: 'No category', color: '#8e8e93', goal: 0, none: true });

export const catById = (id) =>
  !id || id === NONE ? NO_CAT : data.cats.find((c) => c.id === id) || { id, name: 'Deleted', color: '#6b6b6b', goal: 0, missing: true };

export function currentCat() {
  if (data.settings.cat === NONE) return NO_CAT;
  let c = data.cats.find((x) => x.id === data.settings.cat);
  if (!c) {
    c = data.cats[0] || NO_CAT;
    data.settings.cat = c.id;
  }
  return c;
}

/** Has any time been logged without a category? */
export const usesNone = () => data.sessions.some((s) => s.cat === NONE);

/** Daily goal in ms for a category, or the overall daily goal (all categories) when catId is null. 0 = no goal. */
export function goalFor(catId) {
  if (catId) return (catById(catId).goal || 0) * MIN;
  return (data.settings.goal || 0) * MIN;
}

export function nextColor() {
  const used = new Set(data.cats.map((c) => c.color));
  return PALETTE.find((c) => !used.has(c)) || PALETTE[data.cats.length % PALETTE.length];
}

/* ---------- days ---------- */

export const keyOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export function keyDate(k) {
  const [y, m, d] = k.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** The day a timestamp belongs to, honouring the "new day starts at" setting. */
export function dayKey(ts) {
  const d = new Date(ts);
  if (d.getHours() < data.settings.dayStart) d.setDate(d.getDate() - 1);
  return keyOf(d);
}

export function addDays(k, n) {
  const d = keyDate(k);
  d.setDate(d.getDate() + n);
  return keyOf(d);
}

export function dayStartTs(k) {
  const d = keyDate(k);
  d.setHours(data.settings.dayStart);
  return d.getTime();
}

export const dayEndTs = (k) => dayStartTs(addDays(k, 1));

export function weekStartKey(k) {
  const d = keyDate(k);
  d.setDate(d.getDate() - ((d.getDay() - data.settings.weekStart + 7) % 7));
  return keyOf(d);
}

/* ---------- sessions ---------- */

export const getSession = (id) => data.sessions.find((s) => s.id === id);

export function removeSession(id) {
  const i = data.sessions.findIndex((s) => s.id === id);
  if (i >= 0) data.sessions.splice(i, 1);
}

export function rawDur(s, now = Date.now()) {
  let t = 0;
  for (const [a, b] of s.segs) t += b - a;
  if (s.run != null) t += Math.max(0, now - s.run);
  return t;
}

export const sessionDur = (s, now = Date.now()) => Math.max(0, rawDur(s, now) + (s.adj || 0));

export function sessionEnd(s, now = Date.now()) {
  if (s.run != null) return now;
  const last = s.segs[s.segs.length - 1];
  return last ? last[1] : s.start;
}

/** How much of a session falls on each day: { '2026-09-28': ms, ... }. Handles sessions across midnight. */
function partsOf(s, now) {
  const parts = {};
  let raw = 0;
  const segs = s.run != null ? [...s.segs, [s.run, now]] : s.segs;
  for (const [a, b] of segs) {
    let t = a;
    while (t < b) {
      const k = dayKey(t);
      const e = Math.min(b, dayEndTs(k));
      if (e <= t) break;
      parts[k] = (parts[k] || 0) + (e - t);
      raw += e - t;
      t = e;
    }
  }
  const adj = s.adj || 0;
  if (adj > 0) {
    const k = dayKey(s.start);
    parts[k] = (parts[k] || 0) + adj;
  } else if (adj < 0 && raw > 0) {
    const f = Math.max(0, (raw + adj) / raw);
    for (const k in parts) parts[k] *= f;
  }
  return parts;
}

let cache = null; // Map dayKey -> { total, cats } for all sessions that are not running

function build() {
  cache = new Map();
  for (const s of data.sessions) {
    if (s.run != null) continue;
    const p = partsOf(s, 0);
    for (const k in p) {
      let d = cache.get(k);
      if (!d) cache.set(k, (d = { total: 0, cats: {} }));
      d.total += p[k];
      d.cats[s.cat] = (d.cats[s.cat] || 0) + p[k];
    }
  }
}

function liveSessions() {
  const out = [];
  for (const m of MODES) {
    const r = data.runners[m];
    const s = r.runStart != null && r.sid ? getSession(r.sid) : null;
    if (s && s.run != null) out.push(s);
  }
  return out;
}

/** Totals for one day, including the clock that is running right now. */
export function dayData(k, now = Date.now()) {
  if (!cache) build();
  const base = cache.get(k);
  const out = { total: base ? base.total : 0, cats: base ? { ...base.cats } : {} };
  for (const live of liveSessions()) {
    const ms = partsOf(live, now)[k];
    if (ms) {
      out.total += ms;
      out.cats[live.cat] = (out.cats[live.cat] || 0) + ms;
    }
  }
  return out;
}

/** Longest run of consecutive days with at least a minute of focus, ever. */
export function bestStreak(now = Date.now()) {
  if (!cache) build();
  const keys = [...cache.entries()].filter(([, d]) => d.total >= MIN).map(([k]) => k).sort();
  let best = 0;
  let run = 0;
  let prev = null;
  for (const k of keys) {
    run = prev && addDays(prev, 1) === k ? run + 1 : 1;
    best = Math.max(best, run);
    prev = k;
  }
  return Math.max(best, streak(null, now));
}

export const recentSessions = (n) => [...data.sessions].sort((a, b) => b.start - a.start).slice(0, n);

export function sessionsOnDay(k, now = Date.now()) {
  const t0 = dayStartTs(k);
  const t1 = dayEndTs(k);
  return data.sessions
    .filter((s) => s.start < t1 && sessionEnd(s, now) >= t0)
    .filter((s) => (partsOf(s, now)[k] || 0) > 0 || dayKey(s.start) === k)
    .sort((a, b) => b.start - a.start);
}

/** Consecutive days (ending today, or yesterday if today is still empty) with at least a minute of focus. */
export function streak(catId = null, now = Date.now()) {
  const val = (k) => {
    const d = dayData(k, now);
    return catId ? d.cats[catId] || 0 : d.total;
  };
  let k = dayKey(now);
  let n = 0;
  if (val(k) < MIN) k = addDays(k, -1);
  for (let i = 0; i < 3650 && val(k) >= MIN; i++) {
    n++;
    k = addDays(k, -1);
  }
  return n;
}
