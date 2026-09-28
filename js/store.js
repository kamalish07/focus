import { PALETTE } from './config.js';
import { MIN, pad } from './util.js';

const KEY = 'focus.v1';

export const DEFAULT_SETTINGS = {
  theme: 'classic',
  custom: { bg: '#000000', card: '#121212', digit: '#b3b3b3', accent: '#d4e157' },
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
  goal: 0, // minutes per day across all categories; 0 = sum of category goals
  weekStart: 1,
  dayStart: 0, // hour a new "day" begins, for night owls
  minSave: 30, // seconds; shorter sessions are not kept
  cat: 'study',
  seenTip: false,
  bgSound: 'silent', // off | silent | brown | pink | white — keeps the app alive with the screen off
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
    v: 3,
    settings: structuredClone(DEFAULT_SETTINGS),
    cats: [{ id: 'study', name: 'Study', color: PALETTE[0], goal: 180 }],
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
  settings.pomo = { ...def.settings.pomo, ...(d.settings?.pomo || {}) };
  settings.custom = { ...def.settings.custom, ...(d.settings?.custom || {}) };
  const cats = Array.isArray(d.cats) ? d.cats.filter((c) => c && c.id) : [];
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
  return { v: 3, settings, cats: cats.length ? cats : def.cats, sessions, runners };
}

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return normalize(JSON.parse(raw));
  } catch (e) {
    console.warn('Focus: could not read saved data', e);
  }
  return defaults();
}

// Never reassigned — replaced in place — so every module can hold on to it.
export const data = load();

function setData(obj) {
  for (const k of Object.keys(data)) delete data[k];
  Object.assign(data, obj);
  save();
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
    localStorage.setItem(KEY, JSON.stringify(data));
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

export const catById = (id) =>
  data.cats.find((c) => c.id === id) || { id, name: 'Deleted', color: '#6b6b6b', goal: 0, missing: true };

export function currentCat() {
  let c = data.cats.find((x) => x.id === data.settings.cat);
  if (!c) {
    c = data.cats[0];
    data.settings.cat = c.id;
  }
  return c;
}

/** Daily goal in ms for a category, or for everything when catId is null. */
export function goalFor(catId) {
  if (catId) return (catById(catId).goal || 0) * MIN;
  return (data.settings.goal || data.cats.reduce((a, c) => a + (c.goal || 0), 0)) * MIN;
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
