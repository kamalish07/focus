// Split-flap cards. Each card shows two digits; when the value changes the top
// flap falls forward and the new bottom half swings down into place.

const TEMPLATE =
  '<div class="half upper"><span class="num"></span></div>' +
  '<div class="half lower"><span class="num"></span></div>' +
  '<div class="leaf leaf-up"><span class="num"></span><i class="shade"></i></div>' +
  '<div class="leaf leaf-down"><span class="num"></span><i class="shade"></i></div>';

class Card {
  constructor() {
    this.el = document.createElement('div');
    this.el.className = 'card';
    this.el.innerHTML = TEMPLATE;
    [this.upper, this.lower, this.upText, this.downText] = this.el.querySelectorAll('.num');
    [this.leafUp, this.leafDown] = this.el.querySelectorAll('.leaf');
    [this.shadeUp, this.shadeDown] = this.el.querySelectorAll('.shade');
    this.value = null;
    this.anims = [];
  }

  set(v, animate, dur) {
    if (v === this.value) return;
    const old = this.value;
    this.value = v;
    this.el.classList.toggle('wide', v.length > 2);
    for (const a of this.anims) a.cancel();
    this.anims = [];

    if (!animate || old == null || !this.leafUp.animate) {
      this.upper.textContent = this.lower.textContent = v;
      this.el.classList.remove('flipping');
      return;
    }

    this.upper.textContent = v;
    this.lower.textContent = old;
    this.upText.textContent = old;
    this.downText.textContent = v;
    this.el.classList.add('flipping');

    const half = dur / 2;
    const fall = { duration: half, easing: 'cubic-bezier(.55,.05,.9,.45)', fill: 'forwards' };
    const land = { duration: half, delay: half, easing: 'cubic-bezier(.2,.65,.35,1)', fill: 'both' };
    this.anims = [
      this.leafUp.animate([{ transform: 'rotateX(0deg)' }, { transform: 'rotateX(-90deg)' }], fall),
      this.shadeUp.animate([{ opacity: 0 }, { opacity: 0.5 }], fall),
      this.leafDown.animate([{ transform: 'rotateX(90deg)' }, { transform: 'rotateX(0deg)' }], land),
      this.shadeDown.animate([{ opacity: 0.5 }, { opacity: 0 }], land),
    ];
    const anims = this.anims;
    anims[2].onfinish = () => {
      if (this.anims !== anims) return;
      this.lower.textContent = v;
      this.el.classList.remove('flipping');
      for (const a of anims) a.cancel();
      this.anims = [];
    };
  }
}

export class FlipClock {
  constructor(el, duration = 620) {
    this.el = el;
    this.cards = [];
    this.duration = duration;
  }

  render(values, animate) {
    while (this.cards.length < values.length) {
      const c = new Card();
      this.cards.push(c);
      this.el.appendChild(c.el);
    }
    while (this.cards.length > values.length) this.cards.pop().el.remove();
    values.forEach((v, i) => this.cards[i].set(v, animate, this.duration));
  }
}

/* ---------- sizing ---------- */

const metricsCache = new Map();
export const clearMetrics = () => metricsCache.clear();

/**
 * Measures a font so digits can be sized by their real glyph height and centred
 * exactly on the hinge, whatever font is chosen.
 */
export function fontMetrics(f) {
  const spec = `${f.weight} 100px ${f.family}`;
  if (metricsCache.has(spec)) return metricsCache.get(spec);
  const ctx = document.createElement('canvas').getContext('2d');
  ctx.font = spec;
  let widest = 0;
  for (const d of '0123456789') widest = Math.max(widest, ctx.measureText(d).width);
  const m = ctx.measureText('0');
  const aA = m.actualBoundingBoxAscent || 0;
  const aD = m.actualBoundingBoxDescent || 0;
  const glyphH = aA + aD > 0 ? (aA + aD) / 100 : 0.72;
  let dy = 0;
  if (m.fontBoundingBoxAscent != null && aA + aD > 0) {
    dy = -((m.fontBoundingBoxAscent - m.fontBoundingBoxDescent) + (aD - aA)) / 2 / 100;
  }
  const res = { glyphH, w1: widest / 100 + (f.ls || 0), dy };
  metricsCache.set(spec, res);
  return res;
}

/** Writes card geometry as CSS variables on a clock element. */
export function sizeCards(el, { cw, ch, gap = 0 }, m, s) {
  const target = ch * 0.62 * (s.digitScale || 1);
  const byHeight = target / m.glyphH;
  const fs = Math.min(byHeight, (cw * 0.9) / (2 * m.w1));
  const fs3 = Math.min(byHeight, (cw * 0.92) / (3 * m.w1));
  const px = (k, v) => el.style.setProperty(k, `${v}px`);
  px('--cw', cw);
  px('--ch', ch);
  px('--gap', gap);
  px('--fs', fs);
  px('--fs3', fs3);
  px('--dy', m.dy * fs);
  px('--dy3', m.dy * fs3);
  px('--r', ch * (s.radius ?? 0.09));
  px('--hinge', Math.max(2, Math.round(ch * 0.01)));
}
