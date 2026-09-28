// Clock faces. Every face shows a list of digit groups (e.g. ['47', '19']) and sizes itself
// to the box it's given. Flip is the original split-flap clock; the others are alternatives.
//
// makeFace(el, type, ctx) — ctx can override the font and settings (used by template previews).
// face.render(groups, { animate, running, progress, label, ms, date })
// face.fit({ W, H, row, stretch })
import { FlipClock, fontMetrics, sizeCards } from './flip.js';
import { fontById } from './config.js';
import { data } from './store.js';
import { clamp } from './util.js';

export const FACES = [
  ['flip', 'Flip'],
  ['minimal', 'Minimal'],
  ['neon', 'Neon'],
  ['aurora', 'Aurora'],
  ['led', 'LED'],
  ['dots', 'Dot matrix'],
  ['nixie', 'Nixie'],
  ['ring', 'Ring'],
  ['analog', 'Analog'],
];

const FLIP_SPEED = { slow: 900, normal: 620, fast: 380 };
const px = (el, k, v) => el.style.setProperty(k, `${v}px`);

/** Builds a face inside `el` (replacing whatever was there). */
export function makeFace(el, type = 'flip', ctx = {}) {
  if (!FACES.some(([id]) => id === type)) type = 'flip';
  for (const a of el.getAnimations({ subtree: true })) a.cancel();
  el.innerHTML = '';
  el.removeAttribute('style');
  for (const [id] of FACES) el.classList.remove(`face-${id}`);
  el.classList.add(`face-${type}`);
  const env = {
    s: () => ctx.settings || data.settings,
    m: () => fontMetrics(fontById(ctx.font || (ctx.settings || data.settings).font)),
  };
  const build = { flip: flipFace, minimal: textFace, neon: textFace, aurora: textFace, led: ledFace, dots: dotsFace, nixie: nixieFace, ring: ringFace, analog: analogFace };
  const face = build[type](el, env, type);
  face.type = type;
  return face;
}

/* ---------- Flip: split-flap cards ---------- */

function flipFace(el, env) {
  const clock = new FlipClock(el);
  return {
    get count() {
      return clock.cards.length;
    },
    render(groups, o = {}) {
      const s = env.s();
      clock.duration = FLIP_SPEED[s.flipSpeed] || 620;
      clock.render(groups, !!o.animate && s.flip !== false);
    },
    fit({ W, H, row, stretch }) {
      const n = Math.max(1, clock.cards.length);
      let cw;
      let ch;
      let gap;
      if (row) {
        gap = clamp(W * 0.018, 6, 22);
        cw = (W - gap * (n - 1)) / n;
        ch = Math.min(H, cw * (stretch ? 1.3 : 1.02));
        cw = Math.min(cw, ch * (stretch ? 1.7 : 1.12));
      } else {
        gap = clamp(H * 0.022, 6, 18);
        ch = (H - gap * (n - 1)) / n;
        cw = Math.min(W, ch * (stretch ? 2.2 : 1.35));
        ch = Math.min(ch, cw * (stretch ? 1.35 : 1));
      }
      el.style.flexDirection = row ? 'row' : 'column';
      sizeCards(el, { cw: Math.floor(cw), ch: Math.floor(ch / 2) * 2, gap: Math.round(gap) }, env.m(), env.s());
    },
  };
}

/* ---------- helper for faces made of digit groups ---------- */

function groupKeeper(root, { groupClass, sepHtml, digitHtml }) {
  let groups = [];
  return {
    get list() {
      return groups;
    },
    ensure(n) {
      if (groups.length === n) return false;
      root.innerHTML = '';
      groups = [];
      for (let i = 0; i < n; i++) {
        if (i) root.insertAdjacentHTML('beforeend', sepHtml);
        const g = document.createElement('div');
        g.className = groupClass;
        root.appendChild(g);
        groups.push({ el: g, digits: [], value: '' });
      }
      return true;
    },
    digits(g, len) {
      if (g.digits.length !== len) {
        g.el.innerHTML = digitHtml.repeat(len);
        g.digits = [...g.el.children];
        g.value = '';
      }
      return g.digits;
    },
  };
}

/* ---------- Minimal, Neon and Aurora: big type ---------- */

function textFace(el, env, variant) {
  if (variant === 'aurora') el.insertAdjacentHTML('beforeend', '<div class="au-bg" aria-hidden="true"><i></i><i></i><i></i></div>');
  const root = document.createElement('div');
  root.className = `mn ${variant}`;
  el.appendChild(root);
  const k = groupKeeper(root, { groupClass: 'mn-g', sepHtml: '<span class="mn-sep">:</span>', digitHtml: '<span class="mn-d"></span>' });
  const enter =
    variant === 'neon'
      ? [{ opacity: 0.15, filter: 'brightness(2)' }, { opacity: 1, filter: 'none' }]
      : [{ transform: 'translateY(-28%)', opacity: 0 }, { transform: 'none', opacity: 1 }];
  return {
    get count() {
      return k.list.length;
    },
    render(vals, o = {}) {
      k.ensure(vals.length);
      root.classList.toggle('running', !!o.running);
      if (variant === 'aurora') {
        const pal = `pal-${env.s().aurora || 'ocean'}`;
        if (!el.classList.contains(pal)) {
          for (const c of [...el.classList]) if (c.startsWith('pal-')) el.classList.remove(c);
          el.classList.add(pal);
        }
      }
      vals.forEach((v, i) => {
        const g = k.list[i];
        if (g.value === v) return;
        const had = g.value !== '';
        const ds = k.digits(g, v.length);
        [...v].forEach((ch, j) => {
          if (ds[j].textContent === ch) return;
          ds[j].textContent = ch;
          if (o.animate && had) ds[j].animate(enter, { duration: variant === 'neon' ? 260 : 340, easing: 'cubic-bezier(.2,.8,.2,1)' });
        });
        g.value = v;
      });
    },
    fit({ W, H, row }) {
      const m = env.m();
      const n = Math.max(1, k.list.length);
      const len = Math.max(2, ...k.list.map((g) => g.value.length || 2));
      let fs;
      if (row) fs = Math.min((W * 0.94) / (n * len * m.w1 + (n - 1) * 0.42), (H * 0.8) / m.glyphH);
      else fs = Math.min((W * 0.92) / (len * m.w1), (H * 0.94) / n / (m.glyphH * 1.2));
      root.classList.toggle('col', !row);
      px(el, '--mfs', fs);
      px(el, '--mdy', m.dy * fs);
      px(el, '--mlh', m.glyphH * fs * (row ? 1.3 : 1.18));
    },
  };
}

/* ---------- LED: seven-segment display ---------- */

const T = 11;
const HW = T / 2;
const hSeg = (x1, x2, y) => `${x1},${y} ${x1 + HW},${y - HW} ${x2 - HW},${y - HW} ${x2},${y} ${x2 - HW},${y + HW} ${x1 + HW},${y + HW}`;
const vSeg = (x, y1, y2) => `${x},${y1} ${x + HW},${y1 + HW} ${x + HW},${y2 - HW} ${x},${y2} ${x - HW},${y2 - HW} ${x - HW},${y1 + HW}`;
const SEGS = { a: hSeg(10, 50, 8), b: vSeg(52, 10, 48), c: vSeg(52, 52, 90), d: hSeg(10, 50, 92), e: vSeg(8, 52, 90), f: vSeg(8, 10, 48), g: hSeg(10, 50, 50) };
const LIT = ['abcdef', 'bc', 'abdeg', 'abcdg', 'bcfg', 'acdfg', 'acdefg', 'abc', 'abcdefg', 'abcdfg'];
const ledDigit = (x) => `<g transform="translate(${x},0) skewX(-6)">${Object.entries(SEGS).map(([s, p]) => `<polygon class="s" data-s="${s}" points="${p}"/>`).join('')}</g>`;

function ledFace(el) {
  const root = document.createElement('div');
  root.className = 'led';
  el.appendChild(root);
  let groups = [];
  const build = (vals) => {
    root.innerHTML = '';
    groups = vals.map((v, i) => {
      if (i) root.insertAdjacentHTML('beforeend', '<span class="led-sep"><i></i><i></i></span>');
      const len = v.length;
      root.insertAdjacentHTML('beforeend', `<svg class="led-g" viewBox="-12 0 ${len * 66 + 8} 100" aria-hidden="true">${[...Array(len)].map((_, j) => ledDigit(j * 66)).join('')}</svg>`);
      const svg = root.lastElementChild;
      return { len, value: '', digits: [...svg.querySelectorAll('g')].map((g) => [...g.querySelectorAll('.s')]) };
    });
  };
  return {
    get count() {
      return groups.length;
    },
    render(vals, o = {}) {
      if (vals.length !== groups.length || vals.some((v, i) => v.length !== groups[i].len)) build(vals);
      root.classList.toggle('running', !!o.running);
      vals.forEach((v, i) => {
        const g = groups[i];
        if (g.value === v) return;
        g.value = v;
        [...v].forEach((ch, j) => {
          const on = LIT[Number(ch)] || '';
          for (const p of g.digits[j]) p.classList.toggle('on', on.includes(p.dataset.s));
        });
      });
    },
    fit({ W, H, row }) {
      const n = Math.max(1, groups.length);
      const len = Math.max(2, ...groups.map((g) => g.len));
      const ratio = (len * 66 + 8) / 100;
      const h = row ? Math.min(H * 0.72, (W * 0.84) / (n * ratio + (n - 1) * 0.36)) : Math.min((H * 0.8) / n - H * 0.02, (W * 0.8) / ratio);
      root.classList.toggle('col', !row);
      px(el, '--lh', Math.max(10, h));
    },
  };
}

/* ---------- Dot matrix: 5 × 7 LED board ---------- */

const DOT_FONT = {
  0: ['01110', '10001', '10011', '10101', '11001', '10001', '01110'],
  1: ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  2: ['01110', '10001', '00001', '00010', '00100', '01000', '11111'],
  3: ['11111', '00010', '00100', '00010', '00001', '10001', '01110'],
  4: ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
  5: ['11111', '10000', '11110', '00001', '00001', '10001', '01110'],
  6: ['00110', '01000', '10000', '11110', '10001', '10001', '01110'],
  7: ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  8: ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
  9: ['01110', '10001', '10001', '01111', '00001', '00010', '01100'],
};

function dotsFace(el) {
  const root = document.createElement('div');
  root.className = 'dm';
  el.appendChild(root);
  let groups = [];
  const build = (vals) => {
    root.innerHTML = '';
    groups = vals.map((v, i) => {
      if (i) root.insertAdjacentHTML('beforeend', '<span class="dm-sep"><i></i><i></i></span>');
      const len = v.length;
      let dots = '';
      for (let d = 0; d < len; d++) {
        for (let r = 0; r < 7; r++) for (let c = 0; c < 5; c++) dots += `<circle class="d" cx="${d * 60 + c * 10 + 5}" cy="${r * 10 + 5}" r="4"/>`;
      }
      root.insertAdjacentHTML('beforeend', `<svg class="dm-g" viewBox="0 0 ${len * 60 - 10} 70" aria-hidden="true">${dots}</svg>`);
      const all = [...root.lastElementChild.querySelectorAll('.d')];
      return { len, value: '', digits: [...Array(len)].map((_, d) => all.slice(d * 35, d * 35 + 35)) };
    });
  };
  return {
    get count() {
      return groups.length;
    },
    render(vals, o = {}) {
      if (vals.length !== groups.length || vals.some((v, i) => v.length !== groups[i].len)) build(vals);
      root.classList.toggle('running', !!o.running);
      vals.forEach((v, i) => {
        const g = groups[i];
        if (g.value === v) return;
        g.value = v;
        [...v].forEach((ch, j) => {
          const rows = DOT_FONT[ch] || DOT_FONT[0];
          g.digits[j].forEach((dot, idx) => dot.classList.toggle('on', rows[Math.floor(idx / 5)][idx % 5] === '1'));
        });
      });
    },
    fit({ W, H, row }) {
      const n = Math.max(1, groups.length);
      const len = Math.max(2, ...groups.map((g) => g.len));
      const ratio = (len * 60 - 10) / 70;
      const h = row ? Math.min(H * 0.62, (W * 0.88) / (n * ratio + (n - 1) * 0.42)) : Math.min((H * 0.78) / n - H * 0.03, (W * 0.86) / ratio);
      root.classList.toggle('col', !row);
      px(el, '--dh', Math.max(8, h));
    },
  };
}

/* ---------- Nixie: glowing tube digits ---------- */

function nixieFace(el) {
  const root = document.createElement('div');
  root.className = 'nx';
  el.appendChild(root);
  const tube = `<div class="nx-t">${[1, 6, 2, 7, 5, 0, 4, 9, 8, 3].map((d) => `<span data-d="${d}">${d}</span>`).join('')}</div>`;
  const k = groupKeeper(root, { groupClass: 'nx-g', sepHtml: '<span class="nx-sep"><i></i><i></i></span>', digitHtml: tube });
  return {
    get count() {
      return k.list.length;
    },
    render(vals, o = {}) {
      k.ensure(vals.length);
      root.classList.toggle('running', !!o.running);
      vals.forEach((v, i) => {
        const g = k.list[i];
        if (g.value === v) return;
        const tubes = k.digits(g, v.length);
        [...v].forEach((ch, j) => {
          tubes[j].querySelector('.on')?.classList.remove('on');
          tubes[j].querySelector(`[data-d="${ch}"]`)?.classList.add('on');
        });
        g.value = v;
      });
    },
    fit({ W, H, row }) {
      const n = Math.max(1, k.list.length);
      const len = Math.max(2, ...k.list.map((g) => g.value.length || 2));
      const A = 0.6;
      const tw = row
        ? Math.min((W * 0.92) / (n * len + n * 0.1 * (len - 1) + (n - 1) * 0.5), H * 0.8 * A)
        : Math.min((W * 0.86) / (len + 0.1 * (len - 1)), ((H * 0.9) / n - H * 0.03) * A);
      root.classList.toggle('col', !row);
      px(el, '--tw', tw);
      px(el, '--th', tw / A);
    },
  };
}

/* ---------- Ring: time inside a progress ring ---------- */

const R = 84;
const CIRC = 2 * Math.PI * R;

function ticksSvg(r1Major, r1, r2, cls = '') {
  let out = '';
  for (let i = 0; i < 60; i++) {
    const a = (i / 60) * 2 * Math.PI;
    const major = i % 5 === 0;
    const ra = major ? r1Major : r1;
    out += `<line class="${major ? `major ${cls}` : cls}" x1="${(100 + ra * Math.sin(a)).toFixed(2)}" y1="${(100 - ra * Math.cos(a)).toFixed(2)}" x2="${(100 + r2 * Math.sin(a)).toFixed(2)}" y2="${(100 - r2 * Math.cos(a)).toFixed(2)}"/>`;
  }
  return out;
}

function ringFace(el, env) {
  el.innerHTML = `<div class="rg">
      <svg class="rg-svg" viewBox="0 0 200 200" aria-hidden="true"><g class="rg-ticks">${ticksSvg(91, 93.5, 97)}</g>
        <circle class="rg-track" cx="100" cy="100" r="${R}"/>
        <circle class="rg-arc" cx="100" cy="100" r="${R}" transform="rotate(-90 100 100)" stroke-dasharray="0 ${CIRC}"/>
        <circle class="rg-dot" cx="100" cy="${100 - R}" r="5"/></svg>
      <div class="rg-mid"><div class="rg-time"></div><div class="rg-label"></div></div>
    </div>`;
  const root = el.firstElementChild;
  const time = root.querySelector('.rg-time');
  const label = root.querySelector('.rg-label');
  const arc = root.querySelector('.rg-arc');
  const dot = root.querySelector('.rg-dot');
  let n = 0;
  let len = 2;
  let lastP = 0;
  return {
    get count() {
      return n;
    },
    render(vals, o = {}) {
      n = vals.length;
      len = Math.max(2, ...vals.map((v) => v.length));
      const t = vals.join(':');
      if (time.textContent !== t) time.textContent = t;
      const l = o.label || '';
      if (label.textContent !== l) label.textContent = l;
      const p = clamp(o.progress ?? 0, 0, 1);
      root.classList.toggle('jump', p < lastP - 0.02 || !o.animate);
      lastP = p;
      arc.setAttribute('stroke-dasharray', `${(p * CIRC).toFixed(2)} ${CIRC.toFixed(2)}`);
      const a = p * 2 * Math.PI;
      dot.setAttribute('cx', (100 + R * Math.sin(a)).toFixed(2));
      dot.setAttribute('cy', (100 - R * Math.cos(a)).toFixed(2));
      root.classList.toggle('empty', p <= 0);
    },
    fit({ W, H }) {
      const m = env.m();
      const D = Math.min(W, H) * 0.97;
      const k = Math.max(1, n);
      const fs = Math.min((D * 0.64) / (k * len * m.w1 + (k - 1) * 0.36), (D * 0.27) / m.glyphH);
      px(el, '--rd', D);
      px(el, '--rfs', fs);
      px(el, '--rls', Math.max(8, D * 0.05));
    },
  };
}

/* ---------- Analog: a watch dial ---------- */

function analogFace(el) {
  el.innerHTML = `<div class="an">
      <svg viewBox="0 0 200 200" aria-hidden="true">
        <circle class="an-face" cx="100" cy="100" r="97"/>
        <circle class="an-rim" cx="100" cy="100" r="93"/>
        <g class="an-ticks">${ticksSvg(80, 85, 90)}</g>
        <g class="an-nums"></g>
        <text class="an-label" x="100" y="66"></text>
        <text class="an-digital" x="100" y="146"></text>
        <g class="an-hand an-h"><rect x="96.5" y="50" width="7" height="56" rx="3.5"/></g>
        <g class="an-hand an-m"><rect x="97.5" y="22" width="5" height="84" rx="2.5"/></g>
        <g class="an-hand an-s"><line x1="100" y1="122" x2="100" y2="14"/><circle cx="100" cy="122" r="3.2"/></g>
        <circle class="an-cap" cx="100" cy="100" r="4.2"/>
      </svg>
    </div>`;
  const root = el.firstElementChild;
  const nums = root.querySelector('.an-nums');
  const digital = root.querySelector('.an-digital');
  const label = root.querySelector('.an-label');
  const [hh, mh, sh] = ['.an-h', '.an-m', '.an-s'].map((s) => root.querySelector(s));
  let mode = '';
  let n = 0;
  let lastS = 0;
  const setNums = (m) => {
    mode = m;
    const list = m === 'clock' ? [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] : [60, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];
    nums.innerHTML = list
      .map((v, i) => {
        const a = (i / 12) * 2 * Math.PI;
        return `<text x="${(100 + 69 * Math.sin(a)).toFixed(2)}" y="${(100 - 69 * Math.cos(a)).toFixed(2)}">${v}</text>`;
      })
      .join('');
    root.classList.toggle('timer', m === 'timer');
  };
  const rot = (g, deg) => (g.style.transform = `rotate(${deg.toFixed(2)}deg)`);
  return {
    get count() {
      return n;
    },
    render(vals, o = {}) {
      n = vals.length;
      let h;
      let m;
      let s;
      if (o.date) {
        const d = o.date;
        s = d.getSeconds() + d.getMilliseconds() / 1000;
        m = d.getMinutes() + s / 60;
        h = (d.getHours() % 12) + m / 60;
        if (mode !== 'clock') setNums('clock');
      } else {
        const t = Math.max(0, (o.ms || 0) / 1000);
        s = t % 60;
        m = (t / 60) % 60;
        h = null;
        if (mode !== 'timer') setNums('timer');
      }
      root.classList.toggle('jump', s < lastS - 0.5 || !o.animate);
      lastS = s;
      rot(sh, s * 6);
      rot(mh, m * 6);
      if (h != null) rot(hh, h * 30);
      const t = vals.join(':');
      if (digital.textContent !== t) digital.textContent = t;
      const l = o.label || '';
      if (label.textContent !== l) label.textContent = l;
    },
    fit({ W, H }) {
      px(el, '--ad', Math.min(W, H) * 0.97);
    },
  };
}
