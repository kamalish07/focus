// Clock faces. Every face shows a list of digit groups (e.g. ['47', '19']) and sizes itself
// to the box it's given. Flip is the original split-flap clock; the others are alternatives.
import { FlipClock, fontMetrics, sizeCards } from './flip.js';
import { fontById } from './config.js';
import { data } from './store.js';
import { clamp } from './util.js';

export const FACES = [
  ['flip', 'Flip'],
  ['minimal', 'Minimal'],
  ['led', 'LED'],
  ['nixie', 'Nixie'],
  ['ring', 'Ring'],
];

const metrics = () => fontMetrics(fontById(data.settings.font));
const px = (el, k, v) => el.style.setProperty(k, `${v}px`);

/** Builds a face inside `el` (replacing whatever was there). */
export function makeFace(el, type = 'flip') {
  if (!FACES.some(([id]) => id === type)) type = 'flip';
  for (const a of el.getAnimations({ subtree: true })) a.cancel();
  el.innerHTML = '';
  el.removeAttribute('style');
  for (const [id] of FACES) el.classList.remove(`face-${id}`);
  el.classList.add(`face-${type}`);
  const face = { flip: flipFace, minimal: minimalFace, led: ledFace, nixie: nixieFace, ring: ringFace }[type](el);
  face.type = type;
  return face;
}

/* ---------- Flip: split-flap cards ---------- */

function flipFace(el) {
  const clock = new FlipClock(el);
  return {
    get count() {
      return clock.cards.length;
    },
    render(groups, o = {}) {
      clock.render(groups, !!o.animate && data.settings.flip);
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
      sizeCards(el, { cw: Math.floor(cw), ch: Math.floor(ch / 2) * 2, gap: Math.round(gap) }, metrics(), data.settings);
    },
  };
}

/* ---------- helpers for faces made of digit groups ---------- */

/** Keeps `n` groups of digit elements in `root`, with separators between them. */
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
    /** Makes sure a group has one element per character; returns the digit elements. */
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

/* ---------- Minimal: big clean digits that roll into place ---------- */

function minimalFace(el) {
  const root = document.createElement('div');
  root.className = 'mn';
  el.appendChild(root);
  const k = groupKeeper(root, { groupClass: 'mn-g', sepHtml: '<span class="mn-sep">:</span>', digitHtml: '<span class="mn-d"></span>' });
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
        const had = g.value !== '';
        const ds = k.digits(g, v.length);
        [...v].forEach((ch, j) => {
          if (ds[j].textContent === ch) return;
          ds[j].textContent = ch;
          if (o.animate && had) {
            ds[j].animate([{ transform: 'translateY(-28%)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 340, easing: 'cubic-bezier(.2,.8,.2,1)' });
          }
        });
        g.value = v;
      });
    },
    fit({ W, H, row }) {
      const m = metrics();
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
const SEGS = {
  a: hSeg(10, 50, 8),
  b: vSeg(52, 10, 48),
  c: vSeg(52, 52, 90),
  d: hSeg(10, 50, 92),
  e: vSeg(8, 52, 90),
  f: vSeg(8, 10, 48),
  g: hSeg(10, 50, 50),
};
const LIT = ['abcdef', 'bc', 'abdeg', 'abcdg', 'bcfg', 'acdfg', 'acdefg', 'abc', 'abcdefg', 'abcdfg'];
const ledDigit = (x) =>
  `<g transform="translate(${x},0) skewX(-6)">${Object.entries(SEGS).map(([s, p]) => `<polygon class="s" data-s="${s}" points="${p}"/>`).join('')}</g>`;

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
      const w = len * 66 - 6;
      root.insertAdjacentHTML('beforeend', `<svg class="led-g" viewBox="-12 0 ${w + 14} 100" style="--n:${len}" aria-hidden="true">${[...Array(len)].map((_, j) => ledDigit(j * 66)).join('')}</svg>`);
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
      const ratio = (len * 66 + 8) / 100; // width / height of one group
      let h;
      if (row) h = Math.min(H * 0.72, (W * 0.84) / (n * ratio + (n - 1) * 0.36));
      else h = Math.min((H * 0.8) / n - H * 0.02, (W * 0.8) / ratio);
      root.classList.toggle('col', !row);
      px(el, '--lh', Math.max(10, h));
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
      const A = 0.6; // tube width / height
      let tw;
      if (row) tw = Math.min((W * 0.92) / (n * len + n * 0.1 * (len - 1) + (n - 1) * 0.5), H * 0.8 * A);
      else tw = Math.min((W * 0.86) / (len + 0.1 * (len - 1)), ((H * 0.9) / n - H * 0.03) * A);
      root.classList.toggle('col', !row);
      px(el, '--tw', tw);
      px(el, '--th', tw / A);
    },
  };
}

/* ---------- Ring: time inside a progress ring ---------- */

const R = 84;
const CIRC = 2 * Math.PI * R;

function ringFace(el) {
  let ticks = '';
  for (let i = 0; i < 60; i++) {
    const a = (i / 60) * 2 * Math.PI;
    const major = i % 5 === 0;
    const r1 = major ? 91 : 93.5;
    const r2 = 97;
    ticks += `<line class="${major ? 'major' : ''}" x1="${100 + r1 * Math.sin(a)}" y1="${100 - r1 * Math.cos(a)}" x2="${100 + r2 * Math.sin(a)}" y2="${100 - r2 * Math.cos(a)}"/>`;
  }
  el.innerHTML = `<div class="rg">
      <svg class="rg-svg" viewBox="0 0 200 200" aria-hidden="true"><g class="rg-ticks">${ticks}</g>
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
      root.classList.toggle('jump', p < lastP - 0.02 || !o.animate); // no sweeping backwards
      lastP = p;
      arc.setAttribute('stroke-dasharray', `${(p * CIRC).toFixed(2)} ${CIRC.toFixed(2)}`);
      const a = p * 2 * Math.PI;
      dot.setAttribute('cx', (100 + R * Math.sin(a)).toFixed(2));
      dot.setAttribute('cy', (100 - R * Math.cos(a)).toFixed(2));
      root.classList.toggle('empty', p <= 0);
    },
    fit({ W, H }) {
      const m = metrics();
      const D = Math.min(W, H) * 0.97;
      const k = Math.max(1, n);
      const fs = Math.min((D * 0.64) / (k * len * m.w1 + (k - 1) * 0.36), (D * 0.27) / m.glyphH);
      px(el, '--rd', D);
      px(el, '--rfs', fs);
      px(el, '--rls', Math.max(10, D * 0.05));
    },
  };
}
