import { data, save, on, catById, currentCat, dayKey, dayData, dayStartTs, keyDate, sessionDur, sessionInfo, nextColor, NONE } from './store.js';
import { PALETTE, TIMER_PRESETS } from './config.js';
import * as engine from './engine.js';
import { sheet, icon, toast, dialog, confirmDialog, wheel, hmsWheels, haptic, switchEl, stepperEl, bindControls } from './ui.js';
import { esc, fmtDur, fmtTime, pad, uid, getPath, setPath, MIN, HOUR, SEC } from './util.js';
import { getSupabaseConfig, setSupabaseConfig, isConfigured, getSyncStatus, signIn, signUp, signOut, sync } from './supabase.js';

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

/* ---------- daily goal ---------- */

/** One goal for the whole day: the total across every category. */
export function openGoalSheet(onDone) {
  const cur = data.settings.goal || 0;
  const presets = [30, 60, 120, 180, 240, 360];
  const sh = sheet({
    title: 'Daily goal',
    body: `<p class="hint">How long you want to focus each day, all categories together.</p>
      <div class="wheels"></div>
      <div class="chips center">${presets.map((m) => `<button class="chip" data-set="${m}">${fmtDur(m * MIN)}</button>`).join('')}</div>
      ${actions(cur ? 'Save' : 'Set goal', cur ? '<button class="btn" data-clear>No goal</button>' : '')}`,
  });
  const box = sh.body.querySelector('.wheels');
  const wh = wheel({ max: 16, label: 'h' });
  const wm = wheel({ max: 55, step: 5, label: 'm' });
  box.append(wh, wm);
  const setTo = (m, smooth) => {
    wh.set(Math.floor(m / 60), smooth);
    wm.set(Math.round((m % 60) / 5) * 5, smooth);
  };
  setTo(cur || 120);
  const done = (v) => {
    data.settings.goal = v;
    save();
    sh.close();
    onDone?.();
    toast(v ? `Daily goal: ${fmtDur(v * MIN)}` : 'Daily goal removed');
  };
  sh.body.addEventListener('click', (e) => {
    const set = e.target.closest('[data-set]');
    if (set) {
      setTo(Number(set.dataset.set), true);
      haptic();
      return;
    }
    if (e.target.closest('[data-clear]')) return done(0);
    if (e.target.closest('[data-save]')) done(wh.get() * 60 + wm.get());
  });
}

/* ---------- categories ---------- */

/** "No category" first, then your categories. */
export function openCategories() {
  const sh = sheet({
    title: 'Category',
    body: `<div class="cat-list"></div><button class="btn block ghost" data-new>${icon('plus')}<span>New category</span></button>
      <p class="hint small center">Tap ${icon('edit', 'inline')} to rename, recolour or delete a category.</p>`,
  });
  const list = sh.body.querySelector('.cat-list');
  const draw = () => {
    const day = dayData(dayKey(Date.now()));
    const sel = currentCat().id;
    list.innerHTML = [catById(NONE), ...data.cats]
      .map(
        (c) => `<div class="cat-row${c.id === sel ? ' sel' : ''}${c.none ? ' none' : ''}">
          <button class="cat-pick" data-pick="${esc(c.id)}">
            <span class="dot" style="--c:${esc(c.color)}"></span>
            <span class="cat-name">${esc(c.name)}${c.none ? '<small>Just time it</small>' : ''}</span>
            <span class="cat-meta">${fmtDur(day.cats[c.id] || 0)}${c.goal ? ` / ${fmtDur(c.goal * MIN)}` : ''}</span>
            ${c.id === sel ? icon('check', 'cat-check') : ''}
          </button>
          ${c.none ? '<span class="cat-edit-gap"></span>' : `<button class="icon-btn" data-edit="${esc(c.id)}" aria-label="Edit ${esc(c.name)}">${icon('edit')}</button>`}
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
      if (moved) toast(id === NONE ? 'Current session is now uncategorised' : `Current session moved to ${catById(id).name}`);
      return;
    }
    const ed = e.target.closest('[data-edit]');
    if (ed) return openCategoryEditor(catById(ed.dataset.edit), draw);
    if (e.target.closest('[data-new]')) openCategoryEditor(null, draw);
  });
}

/**
 * Deletes a category after asking. Its logged time can stay (as No category) or go with it.
 * A clock running in it keeps running, uncategorised. Undo puts everything back.
 * Resolves true once deleted.
 */
export async function deleteCategory(cat, onDone) {
  const open = new Set(engine.MODES.map((m) => engine.current(m)?.id).filter(Boolean));
  const mine = data.sessions.filter((s) => s.cat === cat.id);
  const closed = mine.filter((s) => !open.has(s.id));
  let keep = true;
  if (closed.length) {
    const total = closed.reduce((a, s) => a + sessionDur(s), 0);
    const choice = await dialog({
      title: `Delete “${cat.name}”?`,
      message: `It has ${closed.length} logged session${closed.length === 1 ? '' : 's'} (${fmtDur(total)}). Keep that time under No category, or delete it too?`,
      buttons: [
        { label: 'Keep the time', value: 'keep', primary: true },
        { label: 'Delete the time too', value: 'all', danger: true },
        { label: 'Cancel', value: null },
      ],
      stack: true,
    });
    if (!choice) return false;
    keep = choice === 'keep';
  } else if (!(await confirmDialog({ title: `Delete “${cat.name}”?`, message: 'It has no logged time.', ok: 'Delete', danger: true }))) {
    return false;
  }
  const at = data.cats.findIndex((x) => x.id === cat.id);
  if (at < 0) return false;
  const [removed] = data.cats.splice(at, 1);
  const dropped = keep ? [] : closed;
  const relabelled = keep ? mine : mine.filter((s) => open.has(s.id));
  if (dropped.length) {
    const gone = new Set(dropped.map((s) => s.id));
    data.sessions = data.sessions.filter((s) => !gone.has(s.id));
  }
  for (const s of relabelled) s.cat = NONE;
  const wasCurrent = data.settings.cat === cat.id;
  if (wasCurrent) data.settings.cat = NONE;
  save();
  onDone?.();
  toast(`Deleted ${cat.name}`, {
    action: 'Undo',
    onAction: () => {
      data.cats.splice(Math.min(at, data.cats.length), 0, removed);
      data.sessions.push(...dropped);
      for (const s of relabelled) if (s.cat === NONE) s.cat = cat.id;
      if (wasCurrent && data.settings.cat === NONE) data.settings.cat = cat.id;
      save();
      onDone?.();
    },
  });
  return true;
}

export function openCategoryEditor(cat, onDone) {
  const isNew = !cat;
  const c = cat ? { ...cat } : { id: uid(), name: '', color: nextColor(), goal: 0 }; // goals are optional
  const sh = sheet({
    title: isNew ? 'New category' : 'Edit category',
    body: `<label class="field"><span class="field-label">Name</span>
        <input class="input" data-name maxlength="24" autocomplete="off" placeholder="e.g. Math, Reading, Coding" value="${esc(c.name)}"></label>
      <div class="field"><span class="field-label">Colour</span><div class="swatches">
        ${PALETTE.map((col) => `<button class="swatch" data-color="${col}" style="--c:${col}" aria-label="Colour ${col}" aria-pressed="${col === c.color}"></button>`).join('')}
        <label class="swatch custom" style="--c:${esc(c.color)}" aria-label="Custom colour"><input type="color" value="${esc(c.color)}"></label>
      </div></div>
      <div class="group">
        <div class="row"><div class="row-label">Daily goal<small>Optional, just for this category</small></div>
          <div class="row-ctl">${stepperEl('goal', c.goal, { min: 0, max: 960, step: 15, fmt: 'goal' }, 'category goal')}</div></div>
      </div>
      ${actions('Save', isNew ? '' : `<button class="btn danger" data-del>${icon('trash')}<span>Delete</span></button>`)}`,
  });
  bindControls(sh.body, { get: () => c.goal, set: (k, v) => (c.goal = v) });
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
      if (isNew) data.cats.push(c);
      else Object.assign(data.cats.find((x) => x.id === c.id), c);
      save();
      if (isNew && !engine.busy()) engine.setCategory(c.id);
      sh.close();
      onDone?.();
      return;
    }
    if (e.target.closest('[data-del]') && (await deleteCategory(cat, onDone))) sh.close();
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
  const cats = [...data.cats];
  if (catId !== NONE && !cats.some((c) => c.id === catId)) cats.push(catById(catId)); // a deleted category's session
  cats.push(catById(NONE));

  const info = s ? sessionInfo(s, now) : null;
  const MODE_NAME = { stopwatch: 'Stopwatch', timer: 'Timer', pomodoro: 'Pomodoro', manual: 'Added manually' };
  let detailRows = '';
  if (info) {
    detailRows += `
      <div class="sess-detail-row"><span class="sess-detail-label">Time window</span><span class="sess-detail-val" data-live-range>${fmtTime(info.start)} to ${fmtTime(info.end)}</span></div>
      <div class="sess-detail-row"><span class="sess-detail-label">Focus duration</span><span class="sess-detail-val" data-live-dur>${fmtDur(info.dur)}</span></div>
      ${info.adj !== 0 ? `<div class="sess-detail-row"><span class="sess-detail-label">Adjusted</span><span class="sess-detail-val sess-detail-highlight">${info.adj > 0 ? '+' : ''}${fmtDur(info.adj)} edited (${fmtDur(info.raw)} recorded)</span></div>` : info.isEdited ? `<div class="sess-detail-row"><span class="sess-detail-label">Status</span><span class="sess-detail-val sess-detail-highlight">Edited session</span></div>` : ''}
      ${info.breakMs >= MIN ? `<div class="sess-detail-row"><span class="sess-detail-label">Breaks / pauses</span><span class="sess-detail-val">${fmtDur(info.breakMs)} across ${s.segs.length} intervals</span></div>` : ''}
      <div class="sess-detail-row"><span class="sess-detail-label">Source</span><span class="sess-detail-val">${MODE_NAME[info.mode] || 'Stopwatch'}</span></div>
    `;
  } else {
    detailRows += `
      <div class="sess-detail-row"><span class="sess-detail-label">Time window</span><span class="sess-detail-val" data-live-range>${fmtTime(start)} to ${fmtTime(start + dur)}</span></div>
      <div class="sess-detail-row"><span class="sess-detail-label">Focus duration</span><span class="sess-detail-val" data-live-dur>${fmtDur(dur)}</span></div>
      <div class="sess-detail-row"><span class="sess-detail-label">Source</span><span class="sess-detail-val">Manual entry</span></div>
    `;
  }

  const sh = sheet({
    title: isNew ? 'Add session' : 'Session details',
    body: `<div class="sess-detail-card">${detailRows}</div>
      <div class="field"><span class="field-label">Category</span><div class="chips" role="radiogroup">
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

  const updateLiveDetails = () => {
    const dv = sh.body.querySelector('[data-date]')?.value;
    const tv = sh.body.querySelector('[data-time]')?.value;
    if (!dv || !tv) return;
    const [y, mo, da] = dv.split('-').map(Number);
    const [hh, mi] = tv.split(':').map(Number);
    const curStart = new Date(y, mo - 1, da, hh, mi).getTime();
    const curDur = wh.get() * HOUR + wm.get() * MIN;
    const curEnd = curStart + curDur;
    const rangeEl = sh.body.querySelector('[data-live-range]');
    const durEl = sh.body.querySelector('[data-live-dur]');
    if (rangeEl) rangeEl.textContent = `${fmtTime(curStart)} to ${fmtTime(curEnd)}`;
    if (durEl) durEl.textContent = fmtDur(curDur);
  };

  sh.body.querySelector('[data-date]').addEventListener('change', updateLiveDetails);
  sh.body.querySelector('[data-time]').addEventListener('change', updateLiveDetails);
  sh.body.querySelector('[data-date]').addEventListener('input', updateLiveDetails);
  sh.body.querySelector('[data-time]').addEventListener('input', updateLiveDetails);
  wh.firstElementChild?.addEventListener('scroll', () => setTimeout(updateLiveDetails, 20), { passive: true });
  wm.firstElementChild?.addEventListener('scroll', () => setTimeout(updateLiveDetails, 20), { passive: true });
  wh.addEventListener('click', () => setTimeout(updateLiveDetails, 20));
  wm.addEventListener('click', () => setTimeout(updateLiveDetails, 20));

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
      data.sessions.push({ id: uid(), cat: catId, mode: 'manual', start: newStart, segs: [[newStart, newStart + newDur]], adj: 0, run: null, note, edited: false });
    } else {
      const anyChange = timeChanged || durChanged || s.cat !== catId || s.note !== note;
      if (timeChanged || durChanged) {
        if (!s.originalDur) s.originalDur = dur;
        s.edited = true;
        s.editedAt = Date.now();
        s.start = newStart;
        s.segs = [[newStart, newStart + newDur]];
        s.adj = 0;
      } else if (anyChange) {
        s.edited = true;
        s.editedAt = Date.now();
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

/* ---------- account & cloud sync ---------- */

export function openAccountSheet(onDone) {
  let activeTab = 'signup';

  function renderBody() {
    const status = getSyncStatus();
    const user = status.user;

    if (user) {
      const syncDotClass = status.state === 'syncing' ? 'syncing' : status.state === 'synced' ? 'synced' : status.state === 'error' ? 'error' : 'offline';
      const syncLabel = status.state === 'syncing' ? 'Syncing now...' : status.state === 'synced' ? `Synced ${status.lastSync ? fmtTime(status.lastSync) : 'just now'}` : status.state === 'offline' ? 'Offline' : status.error || 'Sync error';

      return `
        <div class="account-card" style="margin-bottom:16px">
          <div class="account-info">
            <span class="account-icon">${icon('user')}</span>
            <div>
              <div class="account-name">${esc(user.username)}</div>
              <div class="account-meta"><span class="sync-dot ${syncDotClass}"></span><span>${esc(syncLabel)}</span></div>
            </div>
          </div>
        </div>
        <p class="hint">Your focus time, sessions, and settings sync automatically between your laptop and phone.</p>
        <div class="sheet-actions" style="margin-top:16px">
          <button class="btn primary" data-sync-now>${icon('sync')}<span>Sync now</span></button>
          <button class="btn danger" data-sign-out>Sign out</button>
        </div>
      `;
    }

    return `
      <div class="auth-tabs">
        <div class="auth-tab ${activeTab === 'signup' ? 'active' : ''}" data-tab="signup">Create ID</div>
        <div class="auth-tab ${activeTab === 'signin' ? 'active' : ''}" data-tab="signin">Sign In</div>
      </div>
      <div class="auth-err" hidden></div>
      <label class="field">
        <span class="field-label">${activeTab === 'signup' ? 'Choose a Username' : 'Username'}</span>
        <input class="input" data-auth-id autocomplete="username" placeholder="e.g. kamal">
      </label>
      <label class="field">
        <span class="field-label">Password</span>
        <input class="input" type="password" data-auth-pass autocomplete="${activeTab === 'signup' ? 'new-password' : 'current-password'}" placeholder="At least 6 characters">
      </label>
      <button class="btn primary block" data-auth-submit>${activeTab === 'signup' ? 'Create ID & Sync' : 'Sign In'}</button>
      <p class="hint small center" style="margin-top:14px">
        ${activeTab === 'signup' ? 'Create an ID to automatically sync and access your focus time on laptop and mobile.' : 'Sign in with the same username on your laptop and phone to sync your data.'}
      </p>
    `;
  }

  const sh = sheet({
    title: 'Focus Cloud Sync',
    body: `<div class="auth-wrap">${renderBody()}</div>`,
  });

  function update() {
    const wrap = sh.body.querySelector('.auth-wrap');
    if (wrap) wrap.innerHTML = renderBody();
  }

  sh.body.addEventListener('click', async (e) => {
    const tabEl = e.target.closest('[data-tab]');
    if (tabEl) {
      activeTab = tabEl.dataset.tab;
      update();
      return;
    }

    if (e.target.closest('[data-toggle-cfg]')) {
      showConfig = !showConfig;
      update();
      return;
    }

    if (e.target.closest('[data-toggle-sql]')) {
      showSql = !showSql;
      update();
      return;
    }

    if (e.target.closest('[data-copy-sql]')) {
      navigator.clipboard?.writeText(SQL_SNIPPET);
      toast('SQL script copied to clipboard!');
      return;
    }

    if (e.target.closest('[data-save-cfg]')) {
      const u = sh.body.querySelector('[data-cfg-url]')?.value || '';
      const k = sh.body.querySelector('[data-cfg-key]')?.value || '';
      if (!u.trim() || !k.trim()) return toast('Please enter both Project URL and Anon key');
      setSupabaseConfig(u, k);
      showConfig = false;
      toast('Supabase configured!');
      update();
      return;
    }

    if (e.target.closest('[data-sync-now]')) {
      const btn = e.target.closest('[data-sync-now]');
      btn.disabled = true;
      toast('Syncing with cloud...');
      const res = await sync();
      btn.disabled = false;
      if (res.ok) toast('Synced successfully');
      else toast(`Sync failed: ${res.error || res.reason}`);
      update();
      onDone?.();
      return;
    }

    if (e.target.closest('[data-sign-out]')) {
      if (await confirmDialog({ title: 'Sign out?', message: 'Your data on this device will stay intact.', ok: 'Sign out' })) {
        await signOut();
        toast('Signed out');
        update();
        onDone?.();
      }
      return;
    }

    if (e.target.closest('[data-auth-submit]')) {
      const idEl = sh.body.querySelector('[data-auth-id]');
      const passEl = sh.body.querySelector('[data-auth-pass]');
      const errEl = sh.body.querySelector('.auth-err');
      const submitBtn = e.target.closest('[data-auth-submit]');
      if (!idEl || !passEl) return;

      const identity = idEl.value.trim();
      const password = passEl.value;

      if (!identity) return toast('Please enter your username or email');
      if (password.length < 6) return toast('Password must be at least 6 characters');

      submitBtn.disabled = true;
      submitBtn.textContent = activeTab === 'signin' ? 'Signing in...' : 'Creating account...';
      if (errEl) errEl.hidden = true;

      try {
        if (activeTab === 'signin') {
          const res = await signIn(identity, password);
          const uname = res.user?.user_metadata?.username || res.user?.email?.split('@')[0] || identity;
          toast(`Signed in as ${uname}!`);
        } else {
          const res = await signUp(identity, password);
          toast(`Welcome ${identity}! Cloud sync active.`);
        }
        sh.close();
        onDone?.();
      } catch (err) {
        if (errEl) {
          errEl.textContent = err.message || 'Authentication error';
          errEl.hidden = false;
        } else {
          toast(err.message || 'Authentication error');
        }
        submitBtn.disabled = false;
        submitBtn.textContent = activeTab === 'signin' ? 'Sign In' : 'Create Account';
      }
    }
  });

  on('sync-status', () => {
    if (document.body.contains(sh.el)) update();
  });
}
