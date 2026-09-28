import { data, on, dayKey, dayData, addDays, keyDate, keyOf, weekStartKey, goalFor, catById, sessionsOnDay, sessionDur, sessionEnd, streak } from './store.js';
import { icon } from './ui.js';
import { openSessionEditor } from './sheets.js';
import * as engine from './engine.js';
import { esc, fmtDur, fmtTime, clamp, MIN, HOUR } from './util.js';

const MODE_ICON = { stopwatch: 'stopwatch', timer: 'timer', pomodoro: 'pomodoro', manual: 'manual' };
const MODE_NAME = { stopwatch: 'Stopwatch', timer: 'Timer', pomodoro: 'Pomodoro', manual: 'Added manually' };
const STEPS_MIN = [5, 10, 15, 20, 30, 60, 90, 120, 180, 240, 300, 360, 480, 600, 720, 960, 1200, 1440, 1800, 2400, 3000, 3600, 4800, 6000, 7200, 9000, 12000];

const niceStep = (max) => (STEPS_MIN.find((m) => max / (m * MIN) <= 4) || 24000) * MIN;
const axisFmt = (ms) => (ms < HOUR ? `${Math.round(ms / MIN)}m` : `${+(ms / HOUR).toFixed(1)}h`);
const fmtDay = (k, opts) => keyDate(k).toLocaleDateString([], opts);

/** Renders the Statistics tab into `root`. Call refresh() whenever the tab is shown. */
export function mountStats(root, { visible = () => true } = {}) {
  const today = dayKey(Date.now());
  const st = { range: 'week', anchor: today, cat: null, sel: today, buckets: [], geom: null };
  let lastW = 0;
  const ro = new ResizeObserver(() => {
    if (!visible() || !root.clientWidth || root.clientWidth === lastW) return;
    lastW = root.clientWidth;
    drawChart();
  });

  const color = (id) => catById(id).color;
  const catOrder = (extra = []) => {
    const ids = data.cats.map((c) => c.id);
    for (const id of extra) if (!ids.includes(id)) ids.push(id);
    return ids;
  };
  const pickCats = (cats) => (st.cat ? { [st.cat]: cats[st.cat] || 0 } : cats);
  const sum = (cats) => Object.values(cats).reduce((a, b) => a + b, 0);

  function dayBucket(k, t, n) {
    const cats = pickCats(dayData(k).cats);
    const d = keyDate(k);
    let short;
    if (st.range === 'week') short = d.toLocaleDateString([], { weekday: n > 0 ? 'short' : 'narrow' });
    else short = String(d.getDate());
    return {
      key: k,
      keys: [k],
      cats,
      total: sum(cats),
      isToday: k === t,
      future: k > t,
      label: fmtDay(k, { weekday: 'short', month: 'short', day: 'numeric' }),
      short,
    };
  }

  function rangeKeys() {
    if (st.range === 'week') {
      const k0 = weekStartKey(st.anchor);
      return Array.from({ length: 7 }, (_, i) => addDays(k0, i));
    }
    const d = keyDate(st.anchor);
    if (st.range === 'month') {
      const n = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
      return Array.from({ length: n }, (_, i) => keyOf(new Date(d.getFullYear(), d.getMonth(), i + 1)));
    }
    const keys = [];
    for (let x = new Date(d.getFullYear(), 0, 1); x.getFullYear() === d.getFullYear(); x.setDate(x.getDate() + 1)) keys.push(keyOf(x));
    return keys;
  }

  function buildBuckets(keys, t) {
    if (st.range !== 'year') {
      const wide = root.clientWidth > 420;
      return keys.map((k) => dayBucket(k, t, wide ? 1 : 0));
    }
    const y = keyDate(st.anchor).getFullYear();
    return Array.from({ length: 12 }, (_, m) => {
      const mk = keys.filter((k) => keyDate(k).getMonth() === m);
      const cats = {};
      for (const k of mk) for (const [id, v] of Object.entries(pickCats(dayData(k).cats))) cats[id] = (cats[id] || 0) + v;
      const first = new Date(y, m, 1);
      return {
        key: mk[0],
        keys: mk,
        cats,
        total: sum(cats),
        isToday: mk.includes(t),
        future: mk[0] > t,
        label: first.toLocaleDateString([], { month: 'long', year: 'numeric' }),
        short: first.toLocaleDateString([], { month: root.clientWidth > 420 ? 'short' : 'narrow' }),
      };
    });
  }

  function rangeTitle(keys) {
    const a = keyDate(keys[0]);
    const b = keyDate(keys[keys.length - 1]);
    const thisYear = new Date().getFullYear();
    if (st.range === 'year') return String(a.getFullYear());
    if (st.range === 'month') return a.toLocaleDateString([], { month: 'long', year: 'numeric' });
    const withYear = b.getFullYear() !== thisYear ? { year: 'numeric' } : {};
    const left = a.toLocaleDateString([], { month: 'short', day: 'numeric' });
    const right = b.toLocaleDateString([], a.getMonth() === b.getMonth() ? { day: 'numeric', ...withYear } : { month: 'short', day: 'numeric', ...withYear });
    return `${left} to ${right}`;
  }

  function render() {
    const now = Date.now();
    const t = dayKey(now);
    const keys = rangeKeys();
    st.buckets = buildBuckets(keys, t);
    const past = keys.filter((k) => k <= t);
    const total = st.buckets.reduce((a, b) => a + b.total, 0);
    const avg = past.length ? total / past.length : 0;
    let best = { k: null, ms: 0 };
    for (const k of past) {
      const v = sum(pickCats(dayData(k).cats));
      if (v > best.ms) best = { k, ms: v };
    }
    const days = streak(st.cat);
    const current = keys.includes(t);
    const period = current ? { week: 'This week', month: 'This month', year: 'This year' }[st.range] : 'Total';
    const rangeTotals = {};
    for (const b of st.buckets) for (const [id, v] of Object.entries(b.cats)) rangeTotals[id] = (rangeTotals[id] || 0) + v;
    const order = catOrder(Object.keys(rangeTotals)).filter((id) => rangeTotals[id] > 0);
    const byValue = [...order].sort((a, b) => rangeTotals[b] - rangeTotals[a]);
    const nextDisabled = keys[keys.length - 1] >= t;
    const tabs = [['week', 'Week'], ['month', 'Month'], ['year', 'Year']];

    root.innerHTML = `<div class="bento">
      ${
        data.cats.length > 1
          ? `<div class="chips filter" role="radiogroup" aria-label="Category filter">
              <button class="chip" role="radio" data-filter="" aria-checked="${!st.cat}">All</button>
              ${data.cats.map((c) => `<button class="chip" role="radio" data-filter="${esc(c.id)}" aria-checked="${st.cat === c.id}"><span class="dot" style="--c:${esc(c.color)}"></span>${esc(c.name)}</button>`).join('')}
            </div>`
          : ''
      }
      <div class="range-bar">
        <div class="seg" role="tablist">${tabs.map(([v, l]) => `<button role="tab" data-range="${v}" aria-selected="${st.range === v}">${l}</button>`).join('')}</div>
        <div class="range-nav">
          <button class="icon-btn" data-nav="-1" aria-label="Previous">${icon('chevronLeft')}</button>
          <span class="range-title">${esc(rangeTitle(keys))}</span>
          <button class="icon-btn" data-nav="1" aria-label="Next" ${nextDisabled ? 'disabled' : ''}>${icon('chevronRight')}</button>
        </div>
      </div>
      <section class="hero-card g-m">
        <div class="hero-label">${period}${st.cat ? ` · ${esc(catById(st.cat).name)}` : ''}</div>
        <div class="hero">${fmtDur(total)}</div>
        <div class="hero-stats">
          <div><span>Daily average</span><b>${fmtDur(avg)}</b></div>
          <div><span>Best day</span><b>${best.ms ? fmtDur(best.ms) : '0m'}</b>${best.k ? `<small>${esc(fmtDay(best.k, { month: 'short', day: 'numeric' }))}</small>` : ''}</div>
          <div><span>Streak</span><b>${days} ${days === 1 ? 'day' : 'days'}</b></div>
        </div>
      </section>
      <section class="chart-card">
        <div class="chart"></div>
        ${order.length > 1 ? `<div class="legend">${order.map((id) => `<span><span class="dot" style="--c:${esc(color(id))}"></span>${esc(catById(id).name)}</span>`).join('')}</div>` : ''}
        <details class="table-view"><summary>Show as table</summary>
          <table><thead><tr><th>${st.range === 'year' ? 'Month' : 'Day'}</th><th>Focus time</th></tr></thead>
          <tbody>${st.buckets.map((b) => `<tr><td>${esc(b.label)}</td><td>${fmtDur(b.total)}</td></tr>`).join('')}</tbody></table>
        </details>
      </section>
      ${
        byValue.length
          ? `<section class="breakdown g-m"><div class="card-head"><h3>By category</h3><span>${esc(rangeTitle(keys))}</span></div>${byValue
              .map((id) => {
                const p = total ? (rangeTotals[id] / total) * 100 : 0;
                return `<div class="bd-row"><span class="dot" style="--c:${esc(color(id))}"></span><span class="bd-name">${esc(catById(id).name)}</span>
                  <span class="bd-val">${fmtDur(rangeTotals[id])}</span><span class="bd-pct">${Math.round(p)}%</span>
                  <span class="bd-bar"><i style="width:${p}%;background:${esc(color(id))}"></i></span></div>`;
              })
              .join('')}</section>`
          : ''
      }
      <section class="day dash-card flush g-m"></section>
    </div>`;
    drawChart();
    renderDay();
  }

  function drawChart() {
    const wrap = root.querySelector('.chart');
    if (!wrap) return;
    const bs = st.buckets;
    const W = Math.max(260, wrap.clientWidth);
    const H = 210;
    const M = { l: 38, r: 8, t: 16, b: 26 };
    const pw = W - M.l - M.r;
    const ph = H - M.t - M.b;
    const goal = st.range === 'year' ? 0 : goalFor(st.cat);
    const maxV = Math.max(goal, ...bs.map((b) => b.total), 30 * MIN);
    const step = niceStep(maxV);
    const top = Math.ceil(maxV / step) * step;
    const y = (v) => M.t + ph - (v / top) * ph;
    const slot = pw / bs.length;
    const bw = Math.max(3, Math.min(24, slot * 0.62));
    const order = catOrder(bs.flatMap((b) => Object.keys(b.cats)));
    let grid = '';
    let bars = '';
    let defs = '';
    let labels = '';
    let hits = '';
    for (let v = 0; v <= top; v += step) {
      grid += `<line class="grid" x1="${M.l}" x2="${W - M.r}" y1="${y(v)}" y2="${y(v)}"/>
        <text class="ytick" x="${M.l - 7}" y="${y(v)}" dy="0.32em" text-anchor="end">${v ? axisFmt(v) : '0'}</text>`;
    }
    const selI = st.range === 'year' ? -1 : bs.findIndex((b) => b.key === st.sel);
    if (selI >= 0) grid = `<rect class="sel-band" x="${M.l + slot * selI + 1}" y="${M.t - 8}" width="${Math.max(0, slot - 2)}" height="${ph + 8}" rx="6"/>` + grid;
    const tops = [];
    bs.forEach((b, i) => {
      const cx = M.l + slot * i + slot / 2;
      const x = cx - bw / 2;
      let yTop = y(0);
      if (b.total > 0) {
        yTop = Math.min(y(b.total), y(0) - 2);
        const r = Math.min(4, bw / 2, y(0) - yTop);
        defs += `<clipPath id="bc${i}"><path d="M${x},${y(0)}V${yTop + r}A${r},${r} 0 0 1 ${x + r},${yTop}H${x + bw - r}A${r},${r} 0 0 1 ${x + bw},${yTop + r}V${y(0)}Z"/></clipPath>`;
        const present = order.filter((id) => b.cats[id] > 0);
        let acc = 0;
        let segs = '';
        let gaps = '';
        present.forEach((id, j) => {
          const y0 = y(acc);
          const y1 = j === present.length - 1 ? yTop : y(acc + b.cats[id]);
          segs += `<rect x="${x}" y="${y1}" width="${bw}" height="${Math.max(0, y0 - y1)}" fill="${esc(color(id))}"/>`;
          if (j > 0) gaps += `<rect class="gap" x="${x}" y="${y0 - 1}" width="${bw}" height="2"/>`;
          acc += b.cats[id];
        });
        bars += `<g clip-path="url(#bc${i})">${segs}${gaps}</g>`;
      }
      tops.push({ cx, yTop });
      const d = st.range === 'month' ? i + 1 : 0;
      const show = st.range !== 'month' || d === 1 || d % 5 === 0 || b.isToday;
      if (show) labels += `<text class="xtick${b.isToday ? ' today' : ''}" x="${cx}" y="${H - 8}" text-anchor="middle">${esc(b.short)}</text>`;
      hits += `<rect class="hit${b.future ? ' future' : ''}" data-i="${i}" x="${M.l + slot * i}" y="0" width="${slot}" height="${H}"><title>${esc(b.label)}: ${fmtDur(b.total)}</title></rect>`;
    });
    const goalSvg = goal
      ? `<line class="goal" x1="${M.l}" x2="${W - M.r}" y1="${y(goal)}" y2="${y(goal)}"/>
         <text class="goal-label" x="${W - M.r}" y="${y(goal) - 5}" text-anchor="end">Goal ${axisFmt(goal)}</text>`
      : '';
    st.geom = { tops, W };
    wrap.innerHTML = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Focus time per ${st.range === 'year' ? 'month' : 'day'}">
        <defs>${defs}</defs>${grid}${goalSvg}${bars}${labels}${hits}</svg><div class="tip" hidden></div>`;
    wrap.onpointermove = (e) => {
      if (e.pointerType !== 'mouse') return;
      const h = e.target.closest('.hit');
      if (h) showTip(+h.dataset.i);
    };
    wrap.onpointerleave = (e) => {
      if (e.pointerType === 'mouse') hideTip();
    };
    wrap.onclick = (e) => {
      const h = e.target.closest('.hit');
      if (!h) return;
      const b = st.buckets[+h.dataset.i];
      if (st.range === 'year') {
        if (b.future) return;
        st.range = 'month';
        st.anchor = b.key;
        st.sel = b.keys.includes(dayKey(Date.now())) ? dayKey(Date.now()) : b.keys[b.keys.length - 1];
        render();
        return;
      }
      if (b.future) return;
      st.sel = b.key;
      drawChart();
      renderDay();
      showTip(+h.dataset.i);
    };
  }

  function showTip(i) {
    const wrap = root.querySelector('.chart');
    const tip = wrap?.querySelector('.tip');
    const b = st.buckets[i];
    if (!tip || !b) return;
    const ids = catOrder(Object.keys(b.cats)).filter((id) => b.cats[id] > 0);
    tip.innerHTML = `<div class="tip-title">${esc(b.label)}</div><div class="tip-total">${b.total ? fmtDur(b.total) : 'No focus time'}</div>
      ${ids.length > 1 ? ids.map((id) => `<div class="tip-row"><span class="dot" style="--c:${esc(color(id))}"></span><span>${esc(catById(id).name)}</span><b>${fmtDur(b.cats[id])}</b></div>`).join('') : ''}`;
    tip.hidden = false;
    const { cx, yTop } = st.geom.tops[i];
    const left = clamp(cx - tip.offsetWidth / 2, 0, st.geom.W - tip.offsetWidth);
    const topPx = Math.max(0, yTop - tip.offsetHeight - 10);
    tip.style.transform = `translate(${left}px, ${topPx}px)`;
  }

  function hideTip() {
    const tip = root.querySelector('.chart .tip');
    if (tip) tip.hidden = true;
  }

  function sessionRow(s, now) {
    const c = catById(s.cat);
    const live = engine.isOpenSession(s.id);
    const end = sessionEnd(s, now);
    const when = end - s.start >= MIN ? `${fmtTime(s.start)} to ${fmtTime(end)}` : fmtTime(s.start);
    return `<button class="sess" data-sess="${esc(s.id)}">
        <span class="dot" style="--c:${esc(c.color)}"></span>
        <span class="sess-main">
          <span class="sess-name">${esc(c.name)}${s.note ? `<span class="sess-note"> · ${esc(s.note)}</span>` : ''}</span>
          <span class="sess-sub">${icon(MODE_ICON[s.mode] || 'stopwatch')}${esc(when)}${live ? ' · <em>in progress</em>' : ` · ${MODE_NAME[s.mode] || ''}`}</span>
        </span>
        <span class="sess-dur">${fmtDur(sessionDur(s, now))}</span>
      </button>`;
  }

  function renderDay() {
    const box = root.querySelector('.day');
    if (!box) return;
    const now = Date.now();
    const list = sessionsOnDay(st.sel, now).filter((s) => !st.cat || s.cat === st.cat);
    const tot = sum(pickCats(dayData(st.sel, now).cats));
    const isToday = st.sel === dayKey(now);
    box.innerHTML = `<div class="day-head"><h3 class="sec-title">${isToday ? 'Today' : esc(fmtDay(st.sel, { weekday: 'long', month: 'short', day: 'numeric' }))}</h3><span class="day-total">${fmtDur(tot)}</span></div>
      ${list.length ? `<div class="sess-list">${list.map((s) => sessionRow(s, now)).join('')}</div>` : '<p class="empty">No sessions on this day yet.</p>'}
      <button class="btn block ghost" data-add>${icon('plus')}<span>Add time manually</span></button>`;
  }

  root.addEventListener('click', (e) => {
    const t = dayKey(Date.now());
    const f = e.target.closest('[data-filter]');
    if (f) {
      st.cat = f.dataset.filter || null;
      return render();
    }
    const r = e.target.closest('[data-range]');
    if (r) {
      st.range = r.dataset.range;
      st.anchor = t;
      st.sel = t;
      return render();
    }
    const nav = e.target.closest('[data-nav]');
    if (nav) {
      const dir = Number(nav.dataset.nav);
      const d = keyDate(st.anchor);
      if (st.range === 'week') st.anchor = addDays(st.anchor, 7 * dir);
      else if (st.range === 'month') st.anchor = keyOf(new Date(d.getFullYear(), d.getMonth() + dir, 1));
      else st.anchor = keyOf(new Date(d.getFullYear() + dir, 0, 1));
      const keys = rangeKeys();
      if (st.range !== 'year') st.sel = keys.includes(t) ? t : keys[keys.length - 1] > t ? keys[0] : keys[keys.length - 1];
      return render();
    }
    const sess = e.target.closest('[data-sess]');
    if (sess) return openSessionEditor(data.sessions.find((s) => s.id === sess.dataset.sess), st.sel, render);
    if (e.target.closest('[data-add]')) openSessionEditor(null, st.sel, render);
  });

  ro.observe(root);
  on('change', () => visible() && render());
  setInterval(() => visible() && engine.active() && render(), 30000);

  return {
    refresh() {
      if (!visible()) return;
      lastW = root.clientWidth;
      render();
    },
  };
}
