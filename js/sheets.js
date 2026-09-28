import { data, save, catById, currentCat, dayKey, dayData, dayStartTs, keyDate, sessionDur, nextColor } from './store.js';
import { PALETTE, TIMER_PRESETS } from './config.js';
import * as engine from './engine.js';
import { sheet, icon, toast, confirmDialog, wheel, hmsWheels, haptic, switchEl, stepperEl, bindControls } from './ui.js';
import { esc, fmtDur, pad, uid, getPath, setPath, MIN, HOUR, SEC } from './util.js';

const minus = (v) => (v > 0 ? `+${v}` : `−${Math.abs(v)}`);
const adjustChips = (list) =>
  `<div class="chips center">${list.map((v) => `<button class="chip" data-add="${v}">${minus(v)} min</button>`).join('')}</div>`;
const actions = (saveLabel = 'Save', extra = '') =>
  `<div class="sheet-actions">${extra || '<button class="btn" data-close>Cancel</button>'}<button class="btn primary" data-save>${saveLabel}</button></div>`;

/* ---------- edit the clock ---------- */

export function openEditor() {
  const m = engine.view();
  if (m === 'stopwatch') editStopwatch();
  else if (m === 'timer') editTimer();
  else editPomodoro();
}

function editStopwatch() {
  const todayMode = data.settings.display === 'today';
  const cat = currentCat();
  const initial = Math.floor(engine.displayMs() / SEC) * SEC;
  const sh = sheet({
    title: todayMode ? `Today · ${cat.name}` : 'Edit stopwatch',
    body: `<p class="hint">${
      todayMode
        ? `Set today’s total for ${esc(cat.name)}. The difference is logged on the current session.`
        : 'Set the time for this session. Handy if you forgot to start or stop the clock.'
    }</p>
      <div class="wheels"></div>
      ${adjustChips([-15, -5, -1, 1, 5, 15])}
      <p class="hint small">${engine.running() ? 'The clock keeps running while you edit. ' : ''}To change earlier sessions, use the Stats tab.</p>
      ${actions()}`,
  });
  const w = hmsWheels(sh.body.querySelector('.wheels'), initial, { maxH: 99 });
  sh.body.addEventListener('click', (e) => {
    const add = e.target.closest('[data-add]');
    if (add) {
      w.set(Math.max(0, w.get() + Number(add.dataset.add) * MIN), true);
      haptic();
      return;
    }
    if (!e.target.closest('[data-save]')) return;
    const want = w.get() - initial;
    const got = engine.adjustStopwatch(want);
    sh.close();
    if (got !== want && want < 0) toast('Only this session’s time can be removed here');
    else if (got) toast(got > 0 ? `Added ${fmtDur(got)}` : `Removed ${fmtDur(-got)}`);
  });
}

function editTimer() {
  const started = engine.hasProgress();
  const r = engine.runner('timer');
  const initial = started ? Math.ceil(engine.remaining() / SEC) * SEC : r.done ? data.settings.timerDur : r.dur;
  const presets = `<div class="chips center">${TIMER_PRESETS.map((m) => `<button class="chip" data-set="${m}">${m < 60 ? `${m} min` : `${m / 60}h`.replace('1.5h', '1½h')}</button>`).join('')}</div>`;
  const sh = sheet({
    title: started ? 'Time remaining' : 'Timer length',
    body: `<div class="wheels"></div>${started ? adjustChips([-5, -1, 1, 5, 10]) : presets}
      ${started ? '<p class="hint small">Changes how much time is left. Time already focused stays logged.</p>' : ''}
      ${actions(started ? 'Save' : 'Set timer')}`,
  });
  const w = hmsWheels(sh.body.querySelector('.wheels'), initial, { maxH: 23 });
  sh.body.addEventListener('click', (e) => {
    const set = e.target.closest('[data-set]');
    if (set) {
      w.set(Number(set.dataset.set) * MIN, true);
      haptic();
      return;
    }
    const add = e.target.closest('[data-add]');
    if (add) {
      w.set(Math.max(0, w.get() + Number(add.dataset.add) * MIN), true);
      haptic();
      return;
    }
    if (!e.target.closest('[data-save]')) return;
    const v = w.get();
    if (started) engine.adjustRemaining(v - initial);
    else if (v < SEC) return toast('Pick a length first');
    else engine.setDuration(v);
    sh.close();
  });
}

function editPomodoro() {
  const started = engine.hasProgress();
  const p = data.settings.pomo;
  const initial = started ? Math.ceil(engine.remaining() / SEC) * SEC : 0;
  const row = (label, ctl) => `<div class="row"><div class="row-label">${label}</div><div class="row-ctl">${ctl}</div></div>`;
  const sh = sheet({
    title: 'Pomodoro',
    body: `${
      started
        ? `<div class="field-label">Time left · ${engine.phaseName()}</div><div class="wheels"></div>${adjustChips([-5, -1, 1, 5])}`
        : ''
    }
      <div class="group">
        ${row('Focus', stepperEl('pomo.focus', p.focus, { min: 1, max: 180, unit: 'min' }, 'focus length'))}
        ${row('Short break', stepperEl('pomo.short', p.short, { min: 1, max: 60, unit: 'min' }, 'short break'))}
        ${row('Long break', stepperEl('pomo.long', p.long, { min: 1, max: 90, unit: 'min' }, 'long break'))}
        ${row('Long break every', stepperEl('pomo.every', p.every, { min: 2, max: 12, unit: 'rounds' }, 'rounds'))}
        ${row('Auto-start breaks', switchEl('pomo.autoBreak', p.autoBreak, 'Auto-start breaks'))}
        ${row('Auto-start focus', switchEl('pomo.autoFocus', p.autoFocus, 'Auto-start focus'))}
      </div>
      ${actions('Done', '<span></span>')}`,
  });
  const w = started ? hmsWheels(sh.body.querySelector('.wheels'), initial, { maxH: 3 }) : null;
  bindControls(sh.body, {
    get: (k) => getPath(data.settings, k),
    set: (k, v) => {
      setPath(data.settings, k, v);
      engine.syncIdle();
      save();
    },
  });
  sh.body.addEventListener('click', (e) => {
    const add = e.target.closest('[data-add]');
    if (add && w) {
      w.set(Math.max(0, w.get() + Number(add.dataset.add) * MIN), true);
      return;
    }
    if (!e.target.closest('[data-save]')) return;
    if (w && w.get() !== initial) engine.adjustRemaining(w.get() - initial);
    sh.close();
  });
}

/* ---------- categories ---------- */

export function openCategories() {
  const sh = sheet({
    title: 'Categories',
    body: `<div class="cat-list"></div><button class="btn block ghost" data-new>${icon('plus')}<span>New category</span></button>`,
  });
  const list = sh.body.querySelector('.cat-list');
  const draw = () => {
    const day = dayData(dayKey(Date.now()));
    const sel = currentCat().id;
    list.innerHTML = data.cats
      .map(
        (c) => `<div class="cat-row${c.id === sel ? ' sel' : ''}">
          <button class="cat-pick" data-pick="${esc(c.id)}">
            <span class="dot" style="--c:${esc(c.color)}"></span>
            <span class="cat-name">${esc(c.name)}</span>
            <span class="cat-meta">${fmtDur(day.cats[c.id] || 0)}${c.goal ? ` / ${fmtDur(c.goal * MIN)}` : ''}</span>
            ${c.id === sel ? icon('check', 'cat-check') : ''}
          </button>
          <button class="icon-btn" data-edit="${esc(c.id)}" aria-label="Edit ${esc(c.name)}">${icon('edit')}</button>
        </div>`
      )
      .join('');
  };
  draw();
  sh.body.addEventListener('click', (e) => {
    const pick = e.target.closest('[data-pick]');
    if (pick) {
      const id = pick.dataset.pick;
      const moved = engine.setCategory(id);
      haptic();
      sh.close();
      if (moved) toast(`Current session moved to ${catById(id).name}`);
      return;
    }
    const ed = e.target.closest('[data-edit]');
    if (ed) return openCategoryEditor(catById(ed.dataset.edit), draw);
    if (e.target.closest('[data-new]')) openCategoryEditor(null, draw);
  });
}

export function openCategoryEditor(cat, onDone) {
  const isNew = !cat;
  const c = cat ? { ...cat } : { id: uid(), name: '', color: nextColor(), goal: 0 }; // goals are optional
  const canDelete = !isNew && data.cats.length > 1;
  const sh = sheet({
    title: isNew ? 'New category' : 'Edit category',
    body: `<label class="field"><span class="field-label">Name</span>
        <input class="input" data-name maxlength="24" autocomplete="off" placeholder="e.g. Math, Reading, Coding" value="${esc(c.name)}"></label>
      <div class="field"><span class="field-label">Colour</span><div class="swatches">
        ${PALETTE.map((col) => `<button class="swatch" data-color="${col}" style="--c:${col}" aria-label="Colour ${col}" aria-pressed="${col === c.color}"></button>`).join('')}
        <label class="swatch custom" style="--c:${esc(c.color)}" aria-label="Custom colour"><input type="color" value="${esc(c.color)}"></label>
      </div></div>
      <div class="field"><span class="field-label">Daily goal</span><div class="wheels"></div><p class="hint small">Leave at 0h 00m for no goal.</p></div>
      ${actions('Save', canDelete ? `<button class="btn danger" data-del>${icon('trash')}<span>Delete</span></button>` : '')}`,
  });
  const box = sh.body.querySelector('.wheels');
  const wh = wheel({ max: 16, label: 'h' });
  const wm = wheel({ max: 55, step: 5, label: 'm' });
  box.append(wh, wm);
  wh.set(Math.floor(c.goal / 60));
  wm.set(Math.round((c.goal % 60) / 5) * 5);
  const custom = sh.body.querySelector('.swatch.custom');
  const pickColor = (col) => {
    c.color = col;
    sh.body.querySelectorAll('.swatch[data-color]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.color === col)));
  };
  custom.querySelector('input').addEventListener('input', (e) => {
    pickColor(e.target.value);
    custom.style.setProperty('--c', e.target.value);
  });
  if (isNew) setTimeout(() => sh.body.querySelector('[data-name]').focus(), 350);

  sh.body.addEventListener('click', async (e) => {
    const sw = e.target.closest('.swatch[data-color]');
    if (sw) return pickColor(sw.dataset.color);
    if (e.target.closest('[data-save]')) {
      c.name = sh.body.querySelector('[data-name]').value.trim() || 'Untitled';
      c.goal = wh.get() * 60 + wm.get();
      if (isNew) data.cats.push(c);
      else Object.assign(data.cats.find((x) => x.id === c.id), c);
      save();
      if (isNew && !engine.busy()) engine.setCategory(c.id);
      sh.close();
      onDone?.();
      return;
    }
    if (e.target.closest('[data-del]')) {
      const n = data.sessions.filter((s) => s.cat === c.id).length;
      const ok = await confirmDialog({
        title: `Delete “${cat.name}”?`,
        message: n ? `Its ${n} logged session${n === 1 ? '' : 's'} will be deleted too.` : 'This category has no logged time.',
        ok: 'Delete',
        danger: true,
      });
      if (!ok) return;
      for (const m of engine.MODES) if (engine.current(m)?.cat === c.id) engine.discardCurrent(m);
      data.sessions = data.sessions.filter((s) => s.cat !== c.id);
      data.cats = data.cats.filter((x) => x.id !== c.id);
      if (data.settings.cat === c.id) data.settings.cat = data.cats[0].id;
      save();
      sh.close();
      onDone?.();
      toast(`Deleted ${cat.name}`);
    }
  });
}

/* ---------- log sessions ---------- */

export function openSessionEditor(s, dayK, onDone) {
  const now = Date.now();
  if (s && engine.isOpenSession(s.id)) {
    toast('This session is still open. Reset the clock to finish it, then edit.');
    return;
  }
  const isNew = !s;
  let start;
  let dur;
  if (s) {
    start = s.start;
    dur = sessionDur(s);
  } else {
    dur = 30 * MIN;
    const k = dayK || dayKey(now);
    if (k === dayKey(now)) start = now - dur;
    else {
      const d = keyDate(k);
      d.setHours(Math.max(9, data.settings.dayStart));
      start = Math.max(d.getTime(), dayStartTs(k));
    }
  }
  const d0 = new Date(start);
  const dateVal = `${d0.getFullYear()}-${pad(d0.getMonth() + 1)}-${pad(d0.getDate())}`;
  const timeVal = `${pad(d0.getHours())}:${pad(d0.getMinutes())}`;
  let catId = s ? s.cat : currentCat().id;
  const cats = data.cats.some((c) => c.id === catId) ? data.cats : [...data.cats, catById(catId)];

  const sh = sheet({
    title: isNew ? 'Add session' : 'Edit session',
    body: `<div class="field"><span class="field-label">Category</span><div class="chips" role="radiogroup">
        ${cats.map((c) => `<button class="chip" role="radio" data-cat="${esc(c.id)}" aria-checked="${c.id === catId}"><span class="dot" style="--c:${esc(c.color)}"></span>${esc(c.name)}</button>`).join('')}
      </div></div>
      <div class="field-row">
        <label class="field"><span class="field-label">Date</span><input class="input" type="date" data-date value="${dateVal}"></label>
        <label class="field"><span class="field-label">Start time</span><input class="input" type="time" data-time value="${timeVal}"></label>
      </div>
      <div class="field"><span class="field-label">Duration</span><div class="wheels"></div></div>
      <label class="field"><span class="field-label">Note</span><input class="input" data-note maxlength="80" placeholder="What did you work on?" value="${esc(s?.note || '')}"></label>
      ${actions(isNew ? 'Add' : 'Save', isNew ? '' : `<button class="btn danger" data-del>${icon('trash')}<span>Delete</span></button>`)}`,
  });
  const box = sh.body.querySelector('.wheels');
  const wh = wheel({ max: 23, label: 'h' });
  const wm = wheel({ max: 59, label: 'm' });
  box.append(wh, wm);
  const h0 = Math.floor(dur / HOUR);
  const m0 = Math.floor((dur % HOUR) / MIN);
  wh.set(Math.min(23, h0));
  wm.set(m0);

  sh.body.addEventListener('click', (e) => {
    const chip = e.target.closest('[data-cat]');
    if (chip) {
      catId = chip.dataset.cat;
      sh.body.querySelectorAll('[data-cat]').forEach((b) => b.setAttribute('aria-checked', String(b === chip)));
      return;
    }
    if (e.target.closest('[data-del]')) {
      const i = data.sessions.indexOf(s);
      data.sessions.splice(i, 1);
      save();
      sh.close();
      onDone?.();
      toast('Session deleted', {
        action: 'Undo',
        onAction: () => {
          data.sessions.push(s);
          save();
          onDone?.();
        },
      });
      return;
    }
    if (!e.target.closest('[data-save]')) return;
    const dv = sh.body.querySelector('[data-date]').value;
    const tv = sh.body.querySelector('[data-time]').value;
    if (!dv || !tv) return toast('Pick a date and start time');
    const [y, mo, da] = dv.split('-').map(Number);
    const [hh, mi] = tv.split(':').map(Number);
    const timeChanged = dv !== dateVal || tv !== timeVal;
    const durChanged = wh.get() !== Math.min(23, h0) || wm.get() !== m0;
    const newStart = timeChanged || isNew ? new Date(y, mo - 1, da, hh, mi).getTime() : start;
    const newDur = durChanged || isNew ? wh.get() * HOUR + wm.get() * MIN : dur;
    if (newDur <= 0) return toast('Duration must be more than zero');
    if (newStart + newDur > Date.now() + MIN) return toast('A session can’t end in the future');
    const note = sh.body.querySelector('[data-note]').value.trim();
    if (isNew) {
      data.sessions.push({ id: uid(), cat: catId, mode: 'manual', start: newStart, segs: [[newStart, newStart + newDur]], adj: 0, run: null, note });
    } else {
      if (timeChanged || durChanged) {
        s.start = newStart;
        s.segs = [[newStart, newStart + newDur]];
        s.adj = 0;
      }
      s.cat = catId;
      s.note = note;
    }
    save();
    sh.close();
    onDone?.();
    toast(isNew ? `Added ${fmtDur(newDur)} to ${catById(catId).name}` : 'Session updated');
  });
}
