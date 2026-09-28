// All sounds are synthesised with Web Audio, so nothing needs downloading and they work offline.

let ctx = null;
let master = null;
let volume = 0.8;
let noise = null;
let loop = null;

function ac() {
  if (!ctx) {
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return null;
    ctx = new C();
    master = ctx.createGain();
    master.gain.value = volume;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

/** Call from a tap so browsers allow sound later (e.g. when a timer ends). */
export const unlock = () => void ac();

export function setVolume(v) {
  volume = v;
  if (master) master.gain.value = v;
}

function tone(c, type, freq, t, peak, attack, decay) {
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + attack + decay + 0.05);
}

function bell(c, f, t, len, peak) {
  tone(c, 'sine', f, t, peak, 0.004, len);
  tone(c, 'sine', f * 2.01, t, peak * 0.35, 0.004, len * 0.5);
  tone(c, 'sine', f * 3.02, t, peak * 0.12, 0.002, len * 0.25);
}

/** Each pattern schedules its notes and returns its length in seconds. */
const PATTERNS = {
  chime(c, t) {
    [659.25, 783.99, 1046.5].forEach((f, i) => bell(c, f, t + i * 0.2, 1.4, 0.22));
    return 1.9;
  },
  bell(c, t) {
    bell(c, 880, t, 2.6, 0.32);
    tone(c, 'sine', 880 * 2.76, t, 0.08, 0.002, 1.0);
    tone(c, 'sine', 880 * 5.4, t, 0.04, 0.002, 0.5);
    return 2.2;
  },
  marimba(c, t) {
    [523.25, 659.25, 783.99, 1046.5, 783.99].forEach((f, i) => {
      tone(c, 'sine', f, t + i * 0.13, 0.3, 0.003, 0.45);
      tone(c, 'sine', f * 4, t + i * 0.13, 0.05, 0.002, 0.08);
    });
    return 1.2;
  },
  digital(c, t) {
    for (let i = 0; i < 4; i++) tone(c, 'square', 2093, t + i * 0.13, 0.08, 0.002, 0.07);
    return 0.9;
  },
};

export function playSound(id) {
  const c = ac();
  const p = PATTERNS[id];
  if (!c || !p) return 0;
  return p(c, c.currentTime + 0.03);
}

export function alarm(id, times = 3) {
  stopAlarm();
  if (!PATTERNS[id]) return;
  let n = 0;
  const go = () => {
    const len = playSound(id);
    if (++n < times) loop = setTimeout(go, (len + 0.5) * 1000);
  };
  go();
}

export function stopAlarm() {
  clearTimeout(loop);
  loop = null;
}

/** Soft mechanical click for card flips. */
export function tick() {
  const c = ac();
  if (!c) return;
  if (!noise) {
    noise = c.createBuffer(1, Math.floor(c.sampleRate * 0.05), c.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length) ** 3;
  }
  const src = c.createBufferSource();
  src.buffer = noise;
  const bp = c.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 2400;
  bp.Q.value = 0.9;
  const g = c.createGain();
  g.gain.value = 0.5;
  src.connect(bp).connect(g).connect(master);
  src.start();
}
