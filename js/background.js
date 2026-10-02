// Keeping the clock alive with the screen off.
//
// Phones freeze web apps when the screen turns off, except ones that are playing audio.
// So while a clock runs we loop a sound through an <audio> element: "silent" is a
// near-inaudible rumble, or you can pick a focus noise. Because the phone then treats
// Focus like a music player, timers keep ticking, alarms ring on time, and the lock
// screen shows the clock with play/pause controls (Media Session API).
import { data, catById } from './store.js';
import * as engine from './engine.js';
import { fmtTime, HOUR } from './util.js';

const RATE = 22050;
const urls = {};
let el = null;
let kind = null;
let lastMode = null;
let lastSig = '';
let lastPos = 0;
let handlersReady = false;

/** Noise that loops seamlessly (the end is cross-faded into the start). */
function noise(k, seconds) {
  const L = seconds * RATE;
  const F = Math.floor(RATE * 0.75);
  const x = new Float32Array(L + F);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0;
  for (let i = 0; i < x.length; i++) {
    const w = Math.random() * 2 - 1;
    if (k === 'white') x[i] = w;
    else if (k === 'pink') {
      b0 = 0.99886 * b0 + w * 0.0555179;
      b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856;
      b4 = 0.55 * b4 + w * 0.5329522;
      b5 = -0.7616 * b5 - w * 0.016898;
      x[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362;
      b6 = w * 0.115926;
    } else {
      last = (last + 0.02 * w) / 1.02; // brown noise (also used, very quietly, for "silent")
      x[i] = last;
    }
  }
  const y = new Float32Array(L);
  for (let i = 0; i < L; i++) {
    if (i < F) {
      const t = i / F;
      y[i] = x[i] * Math.sqrt(t) + x[L + i] * Math.sqrt(1 - t);
    } else y[i] = x[i];
  }
  // Normalise loudness: about -18 dBFS for focus noise, about -60 dBFS for "silent"
  // (quiet enough not to hear, loud enough that the phone counts it as playing).
  let sum = 0;
  for (let i = 0; i < L; i++) sum += y[i] * y[i];
  const rms = Math.sqrt(sum / L) || 1;
  const gain = (k === 'silent' ? 0.001 : 0.12) / rms;
  for (let i = 0; i < L; i++) y[i] *= gain;
  return y;
}

function wav(samples) {
  const buf = new ArrayBuffer(44 + samples.length * 2);
  const v = new DataView(buf);
  const str = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, 'RIFF');
  v.setUint32(4, 36 + samples.length * 2, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, RATE, true);
  v.setUint32(28, RATE * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  str(36, 'data');
  v.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, samples[i])) * 32767, true);
  return new Blob([buf], { type: 'audio/wav' });
}

function urlFor(k) {
  if (!urls[k]) urls[k] = URL.createObjectURL(wav(noise(k === 'silent' ? 'silent' : k, k === 'silent' ? 10 : 15)));
  return urls[k];
}

const abs = (p) => new URL(p, location.href).href;

function setupHandlers() {
  if (handlersReady || !('mediaSession' in navigator)) return;
  handlersReady = true;
  const act = (name, fn) => {
    try {
      navigator.mediaSession.setActionHandler(name, fn);
    } catch {}
  };
  act('play', () => lastMode && engine.play(lastMode));
  act('pause', () => {
    const m = engine.active();
    if (m) engine.pause(m);
  });
  act('nexttrack', () => lastMode === 'pomodoro' && engine.skip());
}

let lastState = '';
/** Media Session calls cross into the browser, so only make them when something changed. */
function setState(ms, state) {
  if (state === lastState) return;
  lastState = state;
  ms.playbackState = state;
}

function lockScreen(m, now, isRunning) {
  if (!('mediaSession' in navigator)) return;
  const ms = navigator.mediaSession;
  if (!m) {
    if (lastSig === 'none') return;
    lastSig = 'none';
    ms.metadata = null;
    setState(ms, 'none');
    return;
  }
  const r = engine.runner(m);
  const cat = catById(engine.current(m)?.cat || data.settings.cat);
  const pos = engine.elapsed(m, now);
  let title;
  let dur;
  if (m === 'stopwatch') {
    title = 'Stopwatch';
    dur = Math.max(HOUR, Math.ceil((pos + 1000) / HOUR) * HOUR);
  } else {
    const label = m === 'timer' ? 'Timer' : engine.phaseName();
    title = isRunning ? `${label} · ends ${fmtTime(now + engine.remaining(m, now))}` : `${label} · paused`;
    dur = r.dur;
  }
  const sig = `${m}|${title}|${cat.name}|${isRunning}`;
  if (sig !== lastSig) {
    lastSig = sig;
    try {
      ms.metadata = new MediaMetadata({
        title,
        artist: cat.none ? 'Focus' : cat.name,
        album: 'Focus',
        artwork: [
          { src: abs('icons/icon-192.png'), sizes: '192x192', type: 'image/png' },
          { src: abs('icons/icon-512.png'), sizes: '512x512', type: 'image/png' },
        ],
      });
    } catch {}
    lastPos = 0;
  }
  setState(ms, isRunning ? 'playing' : 'paused');
  // The lock screen advances the position by itself; re-sync now and then.
  if (now - lastPos > 30000) {
    lastPos = now;
    try {
      ms.setPositionState({ duration: dur / 1000, position: Math.min(pos, dur) / 1000, playbackRate: isRunning ? 1 : 0.000001 });
    } catch {}
  }
}

/** Lock screen while an alarm is ringing. */
function alarmScreen() {
  if (!('mediaSession' in navigator) || lastSig === 'alarm') return;
  lastSig = 'alarm';
  try {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: 'Time’s up',
      artist: 'Open Focus to stop the alarm',
      album: 'Focus',
      artwork: [{ src: abs('icons/icon-512.png'), sizes: '512x512', type: 'image/png' }],
    });
    setState(navigator.mediaSession, 'playing');
  } catch {}
}

let holdUntil = 0;
/** Keep the app awake for a while even though no clock runs (e.g. while an alarm rings). */
export function hold(ms) {
  holdUntil = ms ? Date.now() + ms : 0;
  sync();
}

/** Call whenever clocks change (cheap to call every frame). */
export function sync(now = Date.now()) {
  const s = data.settings;
  const m = engine.active();
  if (m) lastMode = m;
  const shown = m || (lastMode && engine.hasProgress(lastMode) ? lastMode : null);
  const want = (!!m || now < holdUntil) && s.bgSound !== 'off';

  if (want) {
    setupHandlers();
    if (!el) {
      el = new Audio();
      el.loop = true;
      el.preload = 'auto';
      el.setAttribute('playsinline', '');
    }
    if (kind !== s.bgSound) {
      kind = s.bgSound;
      el.src = urlFor(kind);
    }
    const vol = kind === 'silent' ? 1 : s.ambientVol;
    if (el.volume !== vol) el.volume = vol;
    if (el.paused) el.play().catch(() => {});
  } else if (el && !el.paused) {
    el.pause();
  }

  if (s.bgSound !== 'off' && !m && now < holdUntil) alarmScreen();
  else if (s.bgSound !== 'off') lockScreen(shown, now, !!m);
  else if ('mediaSession' in navigator && navigator.mediaSession.metadata) lockScreen(null, now, false);
  if (!m && !shown && now >= holdUntil && lastSig !== 'none') lastSig = '';
}

/** Call from a tap: browsers only allow audio to start after the user interacts. */
export function kick() {
  lastPos = 0;
  sync();
}
