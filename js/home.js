// Home: the current time as a big flip clock filling about 70% of the screen, and below
// it a card grid with the clock you're running, today's goals, streaks and trends.
import { data, dayKey, dayData, addDays, keyDate, weekStartKey, goalFor, catById, streak, bestStreak, recentSessions, sessionDur, sessionEnd } from './store.js';
import * as engine from './engine.js';
import { makeFace } from './faces.js';
import { icon } from './ui.js';
import { openSessionEditor } from './sheets.js';
import { esc, fmtDur, fmtTime, pad, clamp, hms, MIN } from './util.js';

/** 24-hour clock? Follows the phone unless set in Settings. */
export const is24 = () => data.settings.clock24 ?? new Date(2000, 0, 1, 13).toLocaleTimeString([], { hour: 'numeric' }).includes('13');

const HEAT = ['var(--surface-2)', 'color-mix(in srgb, var(--accent) 30%, var(--card))', 'color-mix(in srgb, var(--accent) 54%, var(--card))', 'color-mix(in srgb, var(--accent) 77%, var(--card))', 'var(--accent)'];
const HERO_SHARE = 0.7; // the clock section's share of the screen height

function clockText(ms, countdown) {
  const [h, m, s] = hms(ms, countdown);
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

function greeting(h) {
  if (h >= 5 && h < 12) return 'Good morning';
  if (h >= 12 && h < 17) return 'Good afternoon';
  if (h >= 17 && h < 22) return 'Good evening';
  return 'Burning the midnight oil';
}

function dayLabel(ts, now) {
  const k = dayKey(ts);
  const t = dayKey(now);
  if (k === t) return 'Today';
  if (k === addDays(t, -1)) return 'Yesterday';
  return keyDate(k).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
}

const days = (n) => `${n} ${n === 1 ? 'day' : 'days'}`;
const sumDays = (from, to, now) => {
  let total = 0;
  let active = 0;
  for (let k = from; k <= to; k = addDays(k, 1)) {
    const v = dayData(k, now).total;
    total += v;
    if (v >= MIN) active++;
  }
  return { total, active };
};

export function mountHome(root, { goTab, openSettings, openLooks, togglePlay, visible }) {
  root.innerHTML = `
    <section class="home-hero">
      <header class="hero-head">
        <div class="hero-when"><span class="greet"></span><span class="home-date"></span></div>
        <div class="topbar-right">
          <button class="icon-btn" data-looks aria-label="Looks" title="Looks">${icon('palette')}</button>
          <button class="icon-btn" data-settings aria-label="Settings" title="Settings">${icon('settings')}</button>
        </div>
      </header>
      <div class="clock home-clock" role="timer" aria-label="Current time"></div>
      <div class="home-clock-sub"></div>
    </section>
    <div class="bento home-bento">
      <div class="live-slot"></div>
    </div>`;
  const hero = root.querySelector('.home-hero');
  const clockEl = root.querySelector('.home-clock');
  const sub = root.querySelector('.home-clock-sub');
  const bento = root.querySelector('.home-bento');
  const slot = root.querySelector('.live-slot');
  let face = makeFace(clockEl, data.settings.face);
  let minuteKey = '';
  let chartW = 0;
  let introDone = false;

  function digits(now) {
    const d = new Date(now);
    const h = is24() ? d.getHours() : d.getHours() % 12 || 12;
    const out = [pad(h), pad(d.getMinutes())];
    if (data.settings.clockSeconds) out.push(pad(d.getSeconds()));
    return out;
  }

  /** Hero = 70% of the screen. Portrait stacks the cards; landscape puts them side by side. */
  function fit() {
    if (!visible()) return;
    const landscape = document.getElementById('app').classList.contains('landscape');
    const heroH = Math.round(clamp(innerHeight * HERO_SHARE, 240, Math.max(240, root.clientHeight - 40)));
    hero.style.height = `${heroH}px`;
    const W = clockEl.clientWidth;
    const H = clockEl.clientHeight;
    if (W && H) face.fit({ W, H, row: landscape, stretch: true });
    const w = bento.clientWidth;
    if (w && w !== chartW) drawCharts();
  }

  function header(now) {
    const d = new Date(now);
    root.querySelector('.greet').textContent = greeting(d.getHours());
    root.querySelector('.home-date').textContent = d.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
    const today = dayData(dayKey(now), now).total;
    const ampm = is24() ? '' : `<span class="ampm">${d.getHours() < 12 ? 'AM' : 'PM'}</span>`;
    sub.innerHTML = `${ampm}<span>${today ? `${fmtDur(today)} focused today` : 'Nothing logged yet today'}</span>`;
  }

  /* ---------- the clock you're running ---------- */

  function liveHtml(m) {
    const run = engine.running(m);
    const cat = catById(engine.current(m)?.cat || data.settings.cat);
    const what = m === 'pomodoro' ? engine.phaseName() : engine.modeName(m);
    return `<div class="live-card${run ? ' on' : ''}" role="button" tabindex="0" data-go="${m}" aria-label="Open ${what}">
        <span class="live-ic">${icon(m)}</span>
        <span class="live-main">
          <span class="live-label"><span class="dot" style="--c:${esc(cat.color)}"></span>${esc(what)} · ${esc(cat.name)}</span>
          <span class="live-state">${run ? 'Running' : 'Paused'}</span>
        </span>
        <span class="live-time"></span>
        <button class="live-btn" data-toggle="${m}" aria-label="${run ? 'Pause' : 'Resume'}">${icon(run ? 'pause' : 'play')}</button>
      </div>`;
  }

  function updateLive(now) {
    const m = engine.busy();
    const key = m ? `${m}|${engine.running(m)}|${engine.runner(m).phase}|${data.settings.cat}` : '';
    if (slot.dataset.key !== key) {
      slot.dataset.key = key;
      slot.innerHTML = m ? liveHtml(m) : '';
    }
    if (!m) return;
    const t = slot.querySelector('.live-time');
    const txt = clockText(engine.displayMs(m, now), engine.isCountdown(m));
    if (t.textContent !== txt) t.textContent = txt;
  }

  /* ---------- cards ---------- */

  function ringsCard(today) {
    const goals = data.cats.filter((c) => c.goal > 0).slice(0, 4);
    const goalAll = goalFor(null);
    const rows = goals.map((c) => ({ color: c.color, name: c.name, v: today.cats[c.id] || 0, g: c.goal * MIN }));
    const rings = rows.length ? rows : [{ color: 'var(--accent)', v: today.total, g: goalAll }];
    const size = 132;
    const sw = rings.length > 2 ? 10 : 13;
    const c = size / 2;
    let svg = '';
    rings.forEach((r, i) => {
      const rad = c - sw / 2 - i * (sw + 3);
      if (rad < sw) return;
      const C = 2 * Math.PI * rad;
      const p = r.g ? Math.min(1, r.v / r.g) : 0;
      svg += `<circle cx="${c}" cy="${c}" r="${rad}" style="fill:none;stroke:${r.color};stroke-opacity:.2;stroke-width:${sw}"/>`;
      if (p > 0) {
        svg += `<circle cx="${c}" cy="${c}" r="${rad}" transform="rotate(-90 ${c} ${c})" stroke-linecap="round"
          style="fill:none;stroke:${r.color};stroke-width:${sw}" stroke-dasharray="${(p * C).toFixed(2)} ${C.toFixed(2)}"><title>${esc(r.name || 'Today')}: ${fmtDur(r.v)} of ${fmtDur(r.g)}</title></circle>`;
      }
    });
    const pct = goalAll ? Math.round((today.total / goalAll) * 100) : null;
    return `<section class="dash-card rings-card g-m">
        <div class="rings"><svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" role="img" aria-label="Today's goal progress">${svg}
          <text x="${c}" y="${c}" dy="0.35em" text-anchor="middle" class="ring-center">${pct != null ? `${pct}%` : ''}</text></svg></div>
        <div class="rings-info">
          <div class="card-kicker">Today</div>
          <div class="rings-total">${fmtDur(today.total)}</div>
          <div class="rings-sub">${goalAll ? (pct >= 100 ? 'Daily goal reached 🎉' : `of your ${fmtDur(goalAll)} daily goal`) : 'focused today'}</div>
          ${rows.length ? `<div class="ring-rows">${rows.map((r) => `<div class="ring-row"><span class="dot" style="--c:${esc(r.color)}"></span><span class="rr-name">${esc(r.name)}</span><span class="rr-val">${fmtDur(r.v)} / ${fmtDur(r.g)}</span></div>`).join('')}</div>` : ''}
        </div>
      </section>`;
  }

  const tile = (ic, label, value, subText, cls = '') =>
    `<section class="dash-card tile2 g-s"><div class="card-kicker">${icon(ic)}${label}</div><div class="tile2-value">${value}</div><div class="tile2-sub ${cls}">${subText}</div></section>`;

  function tilesHtml(now, t) {
    const cur = streak(null, now);
    const best = bestStreak(now);

    const ws = weekStartKey(t);
    const week = sumDays(ws, t, now);
    const lastWeek = sumDays(addDays(ws, -7), addDays(t, -7), now);
    const diff = lastWeek.total ? Math.round(((week.total - lastWeek.total) / lastWeek.total) * 100) : null;
    let trend = `Last week by now: ${fmtDur(lastWeek.total)}`;
    let cls = '';
    if (diff != null) {
      trend = `${diff >= 0 ? '▲' : '▼'} ${Math.abs(diff)}% vs last week`;
      cls = diff >= 0 ? 'up' : 'down';
    }

    const d = keyDate(t);
    const monthStart = dayKey(new Date(d.getFullYear(), d.getMonth(), 1, 12).getTime());
    const month = sumDays(monthStart, t, now);
    const last7 = sumDays(addDays(t, -6), t, now);

    return (
      tile('flame', 'Streak', days(cur), `Best: ${days(best)}`) +
      tile('calendar', 'This week', fmtDur(week.total), trend, cls) +
      tile('grid', 'This month', fmtDur(month.total), `${days(month.active)} active`) +
      tile('trend', 'Avg / day', fmtDur(last7.total / 7), 'Last 7 days')
    );
  }

  function weekSvg(W, now) {
    const t = dayKey(now);
    const ws = weekStartKey(t);
    const list = Array.from({ length: 7 }, (_, i) => {
      const k = addDays(ws, i);
      return { k, v: k <= t ? dayData(k, now).total : 0, today: k === t, label: keyDate(k).toLocaleDateString([], { weekday: 'narrow' }), long: keyDate(k).toLocaleDateString([], { weekday: 'long' }) };
    });
    const goal = goalFor(null);
    const H = 140;
    const M = { t: 20, b: 22, l: 2, r: 2 };
    const ph = H - M.t - M.b;
    const max = Math.max(goal, ...list.map((d) => d.v), 30 * MIN) * 1.05;
    const y = (v) => M.t + ph - (v / max) * ph;
    const slotW = (W - M.l - M.r) / 7;
    const bw = Math.min(24, slotW * 0.55);
    let g = `<line class="grid" x1="0" x2="${W}" y1="${y(0)}" y2="${y(0)}"/>`;
    if (goal) g += `<line class="goal" x1="0" x2="${W}" y1="${y(goal)}" y2="${y(goal)}"/>`;
    list.forEach((d, i) => {
      const cx = M.l + slotW * i + slotW / 2;
      const x = cx - bw / 2;
      if (d.v > 0) {
        const top = Math.min(y(d.v), y(0) - 3);
        const r = Math.min(4, bw / 2, y(0) - top);
        g += `<path class="wbar${d.today ? ' today' : ''}" d="M${x},${y(0)}V${top + r}A${r},${r} 0 0 1 ${x + r},${top}H${x + bw - r}A${r},${r} 0 0 1 ${x + bw},${top + r}V${y(0)}Z"><title>${esc(d.long)}: ${fmtDur(d.v)}</title></path>`;
        if (d.today) g += `<text class="wval" x="${cx}" y="${top - 6}" text-anchor="middle">${fmtDur(d.v)}</text>`;
      }
      g += `<text class="xtick${d.today ? ' today' : ''}" x="${cx}" y="${H - 5}" text-anchor="middle">${esc(d.label)}</text>`;
    });
    return `<svg class="mini-chart" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Focus time per day this week">${g}</svg>`;
  }

  function heatSvg(W, now) {
    const t = dayKey(now);
    const cell = 13;
    const gap = 3;
    const left = 16;
    const top = 16;
    const cols = clamp(Math.floor((W - left + gap) / (cell + gap)), 6, 30);
    const start = addDays(weekStartKey(t), -(cols - 1) * 7);
    const goal = goalFor(null);
    const cells = [];
    let max = 0;
    for (let c = 0; c < cols; c++) {
      for (let r = 0; r < 7; r++) {
        const k = addDays(start, c * 7 + r);
        if (k > t) continue;
        const v = dayData(k, now).total;
        max = Math.max(max, v);
        cells.push({ k, v, c, r });
      }
    }
    const level = (v) => {
      if (v < MIN) return 0;
      const q = goal ? v / goal : v / (max || 1);
      if (goal) return q < 0.25 ? 1 : q < 0.5 ? 2 : q < 1 ? 3 : 4;
      return q <= 0.25 ? 1 : q <= 0.5 ? 2 : q <= 0.75 ? 3 : 4;
    };
    const px = (c) => left + c * (cell + gap);
    const py = (r) => top + r * (cell + gap);
    let g = '';
    let lastMonth = -1;
    let lastLabelCol = -9;
    for (let c = 0; c < cols; c++) {
      const d = keyDate(addDays(start, c * 7));
      if (d.getMonth() !== lastMonth) {
        if (c - lastLabelCol >= 3 && (c > 0 || d.getDate() <= 7)) {
          g += `<text class="hm-label" x="${px(c)}" y="10">${esc(d.toLocaleDateString([], { month: 'short' }))}</text>`;
          lastLabelCol = c;
        }
        lastMonth = d.getMonth();
      }
    }
    for (const r of [0, 2, 4]) {
      g += `<text class="hm-label" x="0" y="${py(r) + cell - 3}">${esc(keyDate(addDays(start, r)).toLocaleDateString([], { weekday: 'narrow' }))}</text>`;
    }
    let active = 0;
    for (const cl of cells) {
      const lv = level(cl.v);
      if (lv) active++;
      const tip = `${keyDate(cl.k).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}: ${cl.v >= MIN ? fmtDur(cl.v) : 'no focus'}`;
      g += `<rect x="${px(cl.c)}" y="${py(cl.r)}" width="${cell}" height="${cell}" rx="3" class="${cl.k === t ? 'hm-today' : ''}" style="fill:${HEAT[lv]}"><title>${esc(tip)}</title></rect>`;
    }
    const w = px(cols - 1) + cell + 1;
    const h = py(6) + cell + 1;
    const svg = `<svg class="heatmap" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="Focus time per day for the last ${cols} weeks">${g}</svg>`;
    return { svg, note: `${active} of ${cells.length} days` };
  }

  function recentCard(now) {
    const list = recentSessions(4);
    if (!list.length) {
      return `<section class="dash-card empty-card g-m">${icon('stopwatch')}<p>No sessions yet. Start the stopwatch, a timer or a Pomodoro and your progress will show up here.</p>
        <button class="btn primary" data-go="stopwatch">Start focusing</button></section>`;
    }
    const rows = list
      .map((s) => {
        const c = catById(s.cat);
        const open = engine.isOpenSession(s.id);
        const end = sessionEnd(s, now);
        const when = `${dayLabel(s.start, now)} · ${fmtTime(s.start)}${end - s.start >= MIN ? ` – ${fmtTime(end)}` : ''}`;
        return `<button class="sess" data-sess="${esc(s.id)}"><span class="dot" style="--c:${esc(c.color)}"></span>
          <span class="sess-main"><span class="sess-name">${esc(c.name)}${s.note ? `<span class="sess-note"> · ${esc(s.note)}</span>` : ''}</span>
          <span class="sess-sub">${esc(when)}${open ? ' · <em>in progress</em>' : ''}</span></span>
          <span class="sess-dur">${fmtDur(sessionDur(s, now))}</span></button>`;
      })
      .join('');
    return `<section class="dash-card flush g-m"><div class="card-head pad"><h3>Recent sessions</h3></div><div class="sess-list">${rows}</div></section>`;
  }

  /** Charts are sized to their card, so they're drawn after the grid is laid out. */
  function drawCharts(now = Date.now()) {
    chartW = bento.clientWidth;
    const week = bento.querySelector('[data-chart="week"]');
    if (week) week.innerHTML = weekSvg(Math.max(200, week.clientWidth), now);
    const heat = bento.querySelector('[data-chart="heat"]');
    if (heat) {
      const { svg, note } = heatSvg(Math.max(200, heat.clientWidth), now);
      heat.innerHTML = svg;
      heat.closest('.dash-card').querySelector('[data-note]').textContent = note;
    }
  }

  function refresh() {
    if (!visible()) return;
    const now = Date.now();
    const t = dayKey(now);
    const goal = goalFor(null);
    for (const n of [...bento.children]) if (n !== slot) n.remove();
    bento.insertAdjacentHTML(
      'beforeend',
      ringsCard(dayData(t, now)) +
        tilesHtml(now, t) +
        `<section class="dash-card g-m"><div class="card-head"><h3>This week</h3>${goal ? `<span class="legend-goal"><i></i>Goal ${fmtDur(goal)}</span>` : ''}</div><div class="chart-slot" data-chart="week"></div></section>` +
        `<section class="dash-card g-m"><div class="card-head"><h3>Consistency</h3><span data-note></span></div><div class="chart-slot" data-chart="heat"></div>
          <div class="hm-legend"><span>Less</span>${HEAT.map((f) => `<i style="background:${f}"></i>`).join('')}<span>More</span>${goal ? '<span class="hm-note">· full colour = goal met</span>' : ''}</div></section>` +
        recentCard(now) +
        `<button class="btn block ghost see-all" data-go="stats">${icon('stats')}<span>See all statistics</span></button>`
    );
    drawCharts(now);
    header(now);
    if (!introDone) {
      introDone = true; // cards float in once, not on every refresh
      bento.classList.add('intro');
      setTimeout(() => bento.classList.remove('intro'), 1200);
    }
  }

  function tick(now = Date.now(), animate = true) {
    if (face.type !== data.settings.face) face = makeFace(clockEl, data.settings.face);
    const ds = digits(now);
    const countChanged = ds.length !== face.count;
    const d = new Date(now);
    const label = is24() ? d.toLocaleDateString([], { weekday: 'short' }) : d.getHours() < 12 ? 'AM' : 'PM';
    face.render(ds, { animate: animate && !countChanged, running: true, progress: (d.getSeconds() + d.getMilliseconds() / 1000) / 60, label, date: d });
    if (countChanged) fit();
    const mk = `${d.getHours()}:${d.getMinutes()}`;
    if (mk !== minuteKey) {
      minuteKey = mk;
      header(now);
    }
    updateLive(now);
  }

  root.addEventListener('click', (e) => {
    const tg = e.target.closest('[data-toggle]');
    if (tg) {
      e.stopPropagation();
      togglePlay(tg.dataset.toggle);
      return;
    }
    if (e.target.closest('[data-settings]')) return openSettings();
    if (e.target.closest('[data-looks]')) return openLooks();
    const go = e.target.closest('[data-go]');
    if (go) return goTab(go.dataset.go);
    const s = e.target.closest('[data-sess]');
    if (s) {
      const sess = data.sessions.find((x) => x.id === s.dataset.sess);
      if (sess) openSessionEditor(sess, dayKey(sess.start), refresh);
    }
  });
  root.addEventListener('keydown', (e) => {
    const card = e.target.closest?.('.live-card');
    if (card && (e.key === 'Enter' || e.key === ' ') && e.target === card) {
      e.preventDefault();
      goTab(card.dataset.go);
    }
  });

  return { tick, refresh, fit };
}
