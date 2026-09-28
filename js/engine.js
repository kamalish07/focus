// The clock engine. Each mode (stopwatch, timer, pomodoro) has its own runner; only one
// runs at a time. All timing is based on timestamps, so clocks stay correct even if the
// phone sleeps or the app is closed and reopened.
import { data, save, emit, getSession, removeSession, sessionDur, freshRunner, dayKey, dayData, MODES as ALL_MODES } from './store.js';
import { MIN, uid } from './util.js';

export const MODES = ALL_MODES;

let viewMode = 'stopwatch';
/** The mode whose tab is on screen; the default for every function below. */
export const view = () => viewMode;
export function setView(m) {
  if (MODES.includes(m)) viewMode = m;
}

const S = () => data.settings;
const R = (m) => data.runners[m];

export const runner = (m = viewMode) => R(m);
export const running = (m = viewMode) => R(m).runStart != null;
/** The mode whose clock is running, if any. */
export const active = () => MODES.find((m) => running(m)) || null;
export const isCountdown = (m = viewMode) => m !== 'stopwatch';
/** Whether a mode's current phase counts as focus time (Pomodoro breaks don't). */
const logs = (m) => m !== 'pomodoro' || R(m).phase === 'focus';
export const current = (m = viewMode) => (R(m).sid ? getSession(R(m).sid) || null : null);
export const isOpenSession = (id) => MODES.some((m) => R(m).sid === id);

export function elapsed(m = viewMode, now = Date.now()) {
  const r = R(m);
  return r.acc + (r.runStart != null ? Math.max(0, now - r.runStart) : 0);
}
export const remaining = (m = viewMode, now = Date.now()) => Math.max(0, R(m).dur - elapsed(m, now));
export function hasProgress(m = viewMode) {
  const r = R(m);
  return r.runStart != null || (!r.done && (r.acc !== 0 || !!r.sid));
}
/** The clock that matters most right now: the running one, else the most recently used paused one. */
export const busy = () =>
  active() ||
  MODES.filter((m) => hasProgress(m)).sort((a, b) => (R(b).touched || 0) - (R(a).touched || 0))[0] ||
  null;

export function sessionMs(m = viewMode, now = Date.now()) {
  const s = current(m);
  return s ? sessionDur(s, now) : 0;
}

export function phaseLen(phase) {
  const p = S().pomo;
  return (phase === 'focus' ? p.focus : phase === 'long' ? p.long : p.short) * MIN;
}

export function phaseName(phase = R('pomodoro').phase) {
  return phase === 'focus' ? 'Focus' : phase === 'long' ? 'Long break' : 'Short break';
}

export const modeName = (m) => ({ stopwatch: 'Stopwatch', timer: 'Timer', pomodoro: 'Pomodoro' })[m] || m;

/** The number shown on a mode's flip clock. */
export function displayMs(m = viewMode, now = Date.now()) {
  if (m !== 'stopwatch') return Math.max(0, R(m).dur - elapsed(m, now));
  if (S().display === 'today') return dayData(dayKey(now), now).cats[S().cat] || 0;
  return elapsed(m, now);
}

/* ---------- internals ---------- */

function openSession(m, at) {
  const s = { id: uid(), cat: S().cat, mode: m, start: at, segs: [], adj: 0, run: null };
  data.sessions.push(s);
  R(m).sid = s.id;
  return s;
}

function startAt(m, at) {
  R(m).runStart = at;
  if (logs(m)) (current(m) || openSession(m, at)).run = at;
}

function stopAt(m, at) {
  const r = R(m);
  if (r.runStart == null) return;
  r.acc += Math.max(0, at - r.runStart);
  r.runStart = null;
  const s = current(m);
  if (s && s.run != null) {
    s.segs.push([s.run, Math.max(s.run, at)]);
    s.run = null;
  }
}

/** Close a mode's current session. Too-short sessions are dropped. */
function finalize(m, at) {
  const s = current(m);
  R(m).sid = null;
  if (!s) return { session: null, kept: false };
  if (s.run != null) {
    s.segs.push([s.run, Math.max(s.run, at)]);
    s.run = null;
  }
  const kept = sessionDur(s) >= Math.max(1000, S().minSave * 1000);
  if (!kept) removeSession(s.id);
  return { session: s, kept };
}

function commit() {
  save();
  emit('runner');
}

/* ---------- controls ---------- */

/** Start a clock. Any other running clock is paused. Returns { paused: [modes] } or null. */
export function play(m = viewMode, now = Date.now()) {
  if (running(m)) return null;
  const r = R(m);
  if (r.done) Object.assign(r, freshRunner(m, S()));
  if (isCountdown(m) && r.dur - r.acc <= 0) return null;
  const paused = MODES.filter((o) => o !== m && running(o));
  for (const o of paused) stopAt(o, now);
  startAt(m, now);
  r.touched = now;
  commit();
  return { paused };
}

export function pause(m = viewMode, now = Date.now()) {
  if (!running(m)) return;
  stopAt(m, now);
  R(m).touched = now;
  commit();
}

/**
 * Reset: ends and saves the session. In Pomodoro, resets the current phase first;
 * pressing reset again on an untouched phase restarts the whole cycle.
 * Returns info that can be passed to undoReset().
 */
export function reset(m = viewMode, now = Date.now()) {
  const r = R(m);
  const snapshot = structuredClone(r);
  const wasRunning = running(m);
  const phaseTouched = wasRunning || r.acc !== 0;
  stopAt(m, now);
  const { session, kept } = finalize(m, now);
  if (m === 'pomodoro' && phaseTouched && !r.done) {
    r.acc = 0;
    r.dur = phaseLen(r.phase);
  } else {
    Object.assign(r, freshRunner(m, S()));
  }
  commit();
  return { mode: m, session, kept, snapshot, wasRunning };
}

export function undoReset(info, now = Date.now()) {
  const m = info.mode;
  if (hasProgress(m)) return false;
  const other = active();
  if (info.wasRunning && other) stopAt(other, now);
  const s = info.session;
  if (s) {
    if (!getSession(s.id)) data.sessions.push(s);
    if (info.wasRunning && s.segs.length) s.run = s.segs.pop()[0];
  }
  Object.assign(R(m), info.snapshot);
  commit();
  return true;
}

/** Pomodoro: move to the next phase at time `at`. */
function advance(at, forceStart = null) {
  const r = R('pomodoro');
  const p = S().pomo;
  let res = { session: null, kept: false };
  if (r.phase === 'focus') {
    res = finalize('pomodoro', at);
    r.phase = r.round % p.every === 0 ? 'long' : 'short';
  } else {
    r.round = r.phase === 'long' ? 1 : r.round + 1;
    r.phase = 'focus';
  }
  r.acc = 0;
  r.runStart = null;
  r.done = false;
  r.dur = phaseLen(r.phase);
  const auto = forceStart ?? (r.phase === 'focus' ? p.autoFocus : p.autoBreak);
  if (auto) startAt('pomodoro', at);
  return { ...res, auto };
}

/**
 * Checks whether a countdown has reached zero. Uses the exact finish time, so a timer
 * that ended while the phone was asleep is logged correctly. Returns finish events.
 */
export function tick(now = Date.now()) {
  const events = [];
  for (const m of ['timer', 'pomodoro']) {
    let guard = 0;
    while (running(m) && elapsed(m, now) >= R(m).dur && guard++ < 100) {
      const r = R(m);
      const at = r.runStart + (r.dur - r.acc);
      const ev = { mode: m, phase: r.phase, round: r.round, at, late: now - at };
      stopAt(m, at);
      if (m === 'timer') {
        Object.assign(ev, finalize(m, at));
        r.done = true;
      } else {
        Object.assign(ev, advance(at));
        ev.next = R(m).phase;
      }
      events.push(ev);
    }
  }
  if (events.length) commit();
  return events;
}

export function skip(now = Date.now()) {
  const wasRunning = running('pomodoro');
  stopAt('pomodoro', now);
  const res = advance(now, wasRunning);
  commit();
  return res;
}

/* ---------- editing ---------- */

/** Add (or remove) time on the stopwatch. The change is logged on its current session. */
export function adjustStopwatch(delta, now = Date.now()) {
  if (!delta) return 0;
  let s = current('stopwatch');
  if (!s) {
    if (delta < 0) return 0;
    s = openSession('stopwatch', now);
  }
  const d = Math.max(delta, -sessionDur(s, now));
  s.adj = (s.adj || 0) + d;
  R('stopwatch').acc += d;
  commit();
  return d;
}

/** Change the time left on a running/paused countdown. */
export function adjustRemaining(delta, m = viewMode, now = Date.now()) {
  const r = R(m);
  r.dur = Math.max(elapsed(m, now), r.dur + delta);
  commit();
}

/** Set the length of an idle countdown. */
export function setDuration(ms, m = viewMode) {
  const r = R(m);
  r.dur = Math.max(1000, ms);
  r.acc = 0;
  r.done = false;
  if (m === 'timer') S().timerDur = r.dur;
  commit();
}

/** "+5 min" after a timer finishes. */
export function startExtra(ms, now = Date.now()) {
  stopAt('timer', now);
  finalize('timer', now);
  Object.assign(R('timer'), freshRunner('timer', S()), { dur: ms });
  play('timer', now);
}

/** Switch category. A session in progress on this tab moves with it. Returns true if one moved. */
export function setCategory(id, m = viewMode) {
  if (S().cat === id) return false;
  S().cat = id;
  const s = current(m);
  if (s) s.cat = id;
  commit();
  return !!s;
}

/** Keep an untouched Pomodoro phase in sync with changed settings. */
export function syncIdle() {
  if (hasProgress('pomodoro')) return;
  R('pomodoro').dur = phaseLen(R('pomodoro').phase);
}

/** Throw away a mode's session in progress without saving it. */
export function discardCurrent(m = viewMode, now = Date.now()) {
  const s = current(m);
  stopAt(m, now);
  if (s) removeSession(s.id);
  Object.assign(R(m), freshRunner(m, S()));
  commit();
}
