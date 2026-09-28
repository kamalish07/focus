import { data } from './store.js';
import { $, esc, pad, clamp, hms, fmtDur, MIN } from './util.js';

/* ---------- icons ---------- */

const PATHS = {
  play: '<path d="M7.5 5.2v13.6a1 1 0 0 0 1.52.85l11.05-6.8a1 1 0 0 0 0-1.7L9.02 4.35A1 1 0 0 0 7.5 5.2z" fill="currentColor" stroke="none"/>',
  pause: '<rect x="6" y="5" width="4.3" height="14" rx="1.4" fill="currentColor" stroke="none"/><rect x="13.7" y="5" width="4.3" height="14" rx="1.4" fill="currentColor" stroke="none"/>',
  reset: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>',
  edit: '<path d="M21.17 6.81a1 1 0 0 0-3.98-3.98L3.84 16.17a2 2 0 0 0-.5.83l-1.32 4.35a.5.5 0 0 0 .62.62l4.35-1.32a2 2 0 0 0 .83-.5z"/><path d="m15 5 4 4"/>',
  skip: '<path d="M5.5 5.6v12.8a.8.8 0 0 0 1.24.66l9.3-6.4a.8.8 0 0 0 0-1.32l-9.3-6.4a.8.8 0 0 0-1.24.66z" fill="currentColor" stroke="none"/><path d="M19 5v14" stroke-width="2.6"/>',
  stats: '<path d="M5 20v-8M12 20V5M19 20v-5" stroke-width="2.6"/>',
  settings: '<path d="M20 7h-9M14 17H5"/><circle cx="17" cy="17" r="3"/><circle cx="7" cy="7" r="3"/>',
  chevronRight: '<path d="m9 18 6-6-6-6"/>',
  chevronLeft: '<path d="m15 18-6-6 6-6"/>',
  close: '<path d="M18 6 6 18M6 6l12 12"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  trash: '<path d="M3 6h18M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>',
  download: '<path d="M12 15V3M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5"/>',
  upload: '<path d="M12 3v12M17 8l-5-5-5 5M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>',
  stopwatch: '<circle cx="12" cy="13.5" r="7.5"/><path d="M12 10v3.5l2 2M10 2.5h4"/>',
  timer: '<path d="M6 2.5h12M6 21.5h12M7.5 2.5v3.5a4.5 4.5 0 0 0 9 0V2.5M7.5 21.5V18a4.5 4.5 0 0 1 9 0v3.5"/>',
  pomodoro: '<circle cx="12" cy="13.5" r="7.5"/><path d="M12 6V3M12 6c-1.6-1.4-3.4-1.4-4.6-.9M12 6c1.6-1.4 3.4-1.4 4.6-.9"/>',
  manual: '<path d="M12 20h9"/><path d="M16.4 3.6a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  sound: '<path d="M11 5 6 9H2v6h4l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14"/>',
  home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.5"/>',
  flame: '<path d="M12 2.5c.5 3-1.5 4.8-3 6.5S6 12.6 6 15a6 6 0 0 0 12 0c0-2.3-1.2-4.2-2.4-5.5-.3 1.4-1 2.4-2 3 .4-3.8-.4-7.5-1.6-10z"/>',
  calendar: '<rect x="3" y="4.5" width="18" height="16.5" rx="2.5"/><path d="M3 9.5h18M8 2.5v4M16 2.5v4"/>',
  grid: '<rect x="3" y="3" width="7.5" height="7.5" rx="1.8"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="1.8"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="1.8"/><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.8"/>',
  trend: '<path d="m3 17 6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
  palette: '<path d="M12 22a10 10 0 1 1 10-10c0 2.8-2.2 4-4.2 4H16a2 2 0 0 0-1.5 3.3c.6.8.1 2.7-2.5 2.7z"/><circle cx="7.5" cy="10.5" r="1.3" fill="currentColor" stroke="none"/><circle cx="11" cy="6.8" r="1.3" fill="currentColor" stroke="none"/><circle cx="15.8" cy="8" r="1.3" fill="currentColor" stroke="none"/>',
  chevronDown: '<path d="m6 9 6 6 6-6"/>',
  expand: '<path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>',
  collapse: '<path d="M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7"/>',
  face: '<rect x="3" y="4" width="8" height="16" rx="2"/><rect x="13" y="4" width="8" height="16" rx="2"/><path d="M3 12h8M13 12h8"/>',
};

export const icon = (name, cls = '') =>
  `<svg class="i ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${PATHS[name] || ''}</svg>`;

// Browsers only allow vibration after the user has tapped the page.
export const canVibrate = () => !!navigator.vibrate && navigator.userActivation?.hasBeenActive !== false;

export function haptic(ms = 8) {
  if (data.settings.vibrate && canVibrate()) {
    try {
      navigator.vibrate(ms);
    } catch {}
  }
}

/* ---------- overlay stack (works with the Android back button) ---------- */

const stack = [];
let skipPops = 0;
let pendingPush = 0;

window.addEventListener('popstate', () => {
  if (skipPops > 0) {
    skipPops--;
    if (!skipPops) for (; pendingPush > 0; pendingPush--) history.pushState({ ov: 1 }, '');
    return;
  }
  const top = stack.pop();
  if (top) dismiss(top);
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && stack.length) close(stack[stack.length - 1]);
});

export const overlayOpen = () => stack.length > 0;

function mount(ov, onClose) {
  const entry = { ov, onClose };
  stack.push(entry);
  $('#overlays').appendChild(ov);
  ov.getBoundingClientRect(); // start transition from the closed state
  ov.classList.add('open');
  if (skipPops) pendingPush++;
  else history.pushState({ ov: stack.length }, '');
  return entry;
}

function dismiss(entry) {
  entry.ov.classList.remove('open');
  entry.ov.classList.add('closing');
  setTimeout(() => entry.ov.remove(), 320);
  entry.onClose?.();
}

function close(entry) {
  const i = stack.indexOf(entry);
  if (i < 0) return;
  const removed = stack.splice(i);
  const n = removed.length;
  removed.reverse().forEach(dismiss);
  if (pendingPush >= n) {
    pendingPush -= n;
  } else {
    const back = n - pendingPush;
    pendingPush = 0;
    skipPops++;
    history.go(-back);
  }
}

/**
 * Bottom sheet (kind 'sheet') or full-screen page (kind 'page').
 * Any element with [data-close] inside closes it.
 */
export function sheet({ title, body = '', kind = 'sheet', cls = '', onClose }) {
  const ov = document.createElement('div');
  ov.className = `overlay ${kind} ${cls}`;
  const back = kind === 'page' ? `<button class="icon-btn" data-close aria-label="Back">${icon('chevronLeft')}</button>` : '';
  const x = kind === 'page' ? '' : `<button class="icon-btn" data-close aria-label="Close">${icon('close')}</button>`;
  ov.innerHTML = `<div class="backdrop" data-close></div>
    <section class="panel" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      ${kind === 'sheet' ? '<div class="grabber"></div>' : ''}
      <header class="panel-head">${back}<h2>${esc(title)}</h2>${x}</header>
      <div class="panel-body">${body}</div>
    </section>`;
  const entry = mount(ov, onClose);
  ov.addEventListener('click', (e) => {
    if (e.target.closest('[data-close]')) close(entry);
  });
  if (kind === 'sheet') swipeToClose(ov, () => close(entry));
  return { el: ov, body: ov.querySelector('.panel-body'), close: () => close(entry) };
}

/** Drag a bottom sheet down by its handle or header to dismiss it. */
function swipeToClose(ov, onClose) {
  const panel = ov.querySelector('.panel');
  const grabber = ov.querySelector('.grabber');
  let y0 = null;
  let dy = 0;
  let t0 = 0;
  for (const handle of ov.querySelectorAll('.grabber, .panel-head')) {
    handle.style.touchAction = 'none';
    handle.addEventListener('pointerdown', (e) => {
      if (e.target.closest('button') || getComputedStyle(grabber).display === 'none') return; // not on desktop dialogs
      y0 = e.clientY;
      dy = 0;
      t0 = performance.now();
      panel.style.transition = 'none';
      try {
        handle.setPointerCapture(e.pointerId);
      } catch {}
    });
    handle.addEventListener('pointermove', (e) => {
      if (y0 == null) return;
      dy = Math.max(0, e.clientY - y0);
      panel.style.transform = `translateY(${dy}px)`;
    });
    const end = () => {
      if (y0 == null) return;
      const fast = dy / Math.max(1, performance.now() - t0) > 0.6;
      y0 = null;
      panel.style.transition = '';
      panel.style.transform = '';
      if (dy > 110 || (fast && dy > 30)) onClose();
    };
    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', end);
  }
}

export function dialog({ title, message = '', buttons = [{ label: 'OK', value: true, primary: true }], dismissValue = null }) {
  return new Promise((resolve) => {
    let result = dismissValue;
    const ov = document.createElement('div');
    ov.className = 'overlay dialog';
    ov.innerHTML = `<div class="backdrop" data-dismiss></div>
      <section class="panel" role="alertdialog" aria-modal="true" aria-label="${esc(title)}">
        <h3>${esc(title)}</h3>${message ? `<p>${esc(message)}</p>` : ''}
        <div class="dialog-actions">${buttons
          .map((b, i) => `<button class="btn${b.primary ? ' primary' : ''}${b.danger ? ' danger-fill' : ''}" data-i="${i}">${esc(b.label)}</button>`)
          .join('')}</div>
      </section>`;
    const entry = mount(ov, () => resolve(result));
    ov.addEventListener('click', (e) => {
      const b = e.target.closest('[data-i]');
      if (b) {
        result = buttons[+b.dataset.i].value;
        close(entry);
      } else if (e.target.closest('[data-dismiss]')) close(entry);
    });
  });
}

export const confirmDialog = ({ title, message = '', ok = 'OK', cancel = 'Cancel', danger = false }) =>
  dialog({
    title,
    message,
    buttons: [
      { label: cancel, value: false },
      { label: ok, value: true, primary: !danger, danger },
    ],
    dismissValue: false,
  });

/* ---------- toast ---------- */

let toastTimer = 0;
export function toast(msg, { action, onAction, ms = 3200 } = {}) {
  const t = $('#toast');
  t.innerHTML = `<span>${esc(msg)}</span>${action ? `<button>${esc(action)}</button>` : ''}`;
  const hide = () => t.classList.remove('show');
  if (action) {
    t.querySelector('button').onclick = () => {
      hide();
      onAction?.();
    };
  }
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(hide, action ? Math.max(ms, 5500) : ms);
}

/* ---------- scroll-wheel number picker ---------- */

const ITEM = 40;

export function wheel({ max, min = 0, step = 1, label = '', fmt = pad }) {
  const values = [];
  for (let v = min; v <= max; v += step) values.push(v);
  const el = document.createElement('div');
  el.className = 'wheel';
  el.innerHTML = `<div class="wheel-scroll" tabindex="0" role="spinbutton" aria-label="${esc(label)}" aria-valuemin="${min}" aria-valuemax="${max}">
      <div class="wheel-pad"></div>${values.map((v) => `<div class="wheel-item" data-v="${v}">${fmt(v)}</div>`).join('')}<div class="wheel-pad"></div>
    </div>${label ? `<span class="wheel-label">${esc(label)}</span>` : ''}`;
  const sc = el.firstElementChild;
  const items = sc.querySelectorAll('.wheel-item');
  let target = null;
  let shown = -1;
  let raf = 0;
  const indexOf = (v) => clamp(Math.round((v - min) / step), 0, values.length - 1);
  const atScroll = () => clamp(Math.round(sc.scrollTop / ITEM), 0, values.length - 1);

  function mark() {
    const i = target != null ? indexOf(target) : atScroll();
    if (i === shown) return;
    items[shown]?.classList.remove('sel');
    items[i].classList.add('sel');
    shown = i;
    sc.setAttribute('aria-valuenow', values[i]);
  }
  function set(v, smooth = false) {
    const i = indexOf(v);
    target = values[i];
    if (smooth) sc.scrollTo({ top: i * ITEM, behavior: 'smooth' });
    else sc.scrollTop = i * ITEM;
    mark();
  }
  const release = () => (target = null);

  sc.addEventListener('scroll', () => {
    if (!raf) raf = requestAnimationFrame(() => ((raf = 0), mark()));
  }, { passive: true });
  sc.addEventListener('pointerdown', release);
  sc.addEventListener('touchstart', release, { passive: true });
  sc.addEventListener('wheel', release, { passive: true });
  sc.addEventListener('click', (e) => {
    const it = e.target.closest('.wheel-item');
    if (it) set(+it.dataset.v, true);
  });
  sc.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    e.preventDefault();
    const i = clamp(indexOf(el.get()) + (e.key === 'ArrowDown' ? 1 : -1), 0, values.length - 1);
    set(values[i], true);
  });

  el.get = () => (target != null ? target : values[atScroll()]);
  el.set = set;
  return el;
}

/** Hours / minutes / seconds wheels. Call after `container` is in the page. */
export function hmsWheels(container, ms, { maxH = 23, seconds = true } = {}) {
  const wh = wheel({ max: maxH, label: 'h' });
  const wm = wheel({ max: 59, label: 'm' });
  const ws = seconds ? wheel({ max: 59, label: 's' }) : null;
  container.append(wh, wm, ...(ws ? [ws] : []));
  const api = {
    get: () => (wh.get() * 3600 + wm.get() * 60 + (ws ? ws.get() : 0)) * 1000,
    set(v, smooth = false) {
      const [h, m, s] = hms(v);
      wh.set(Math.min(h, maxH), smooth);
      wm.set(m, smooth);
      ws?.set(s, smooth);
    },
  };
  api.set(ms);
  return api;
}

/* ---------- form controls ---------- */

export const switchEl = (key, on, label) =>
  `<button class="switch" role="switch" aria-checked="${!!on}" data-key="${key}" aria-label="${esc(label)}"><i></i></button>`;

export const segEl = (key, value, options, label = '') =>
  `<div class="seg" data-key="${key}" role="radiogroup" aria-label="${esc(label)}">${options
    .map(([v, l]) => `<button role="radio" aria-checked="${String(v) === String(value)}" data-v="${v}">${esc(l)}</button>`)
    .join('')}</div>`;

export function fmtStep(v, fmt, unit) {
  if (fmt === 'goal') return v ? fmtDur(v * MIN) : 'Auto';
  return `${v}${unit ? ` ${unit}` : ''}`;
}

export const stepperEl = (key, value, { min, max, step = 1, unit = '', fmt = '' }, label = '') =>
  `<div class="stepper" data-key="${key}" data-min="${min}" data-max="${max}" data-step="${step}" data-unit="${esc(unit)}" data-fmt="${fmt}">
    <button data-dir="-1" aria-label="Decrease ${esc(label)}">−</button><output>${esc(fmtStep(value, fmt, unit))}</output><button data-dir="1" aria-label="Increase ${esc(label)}">+</button>
  </div>`;

const parseVal = (v) => (v === 'true' ? true : v === 'false' ? false : /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : v);

/** Wires switches, segmented controls, steppers, ranges and selects that carry data-key. */
export function bindControls(root, { get, set }) {
  let holdTimer = 0;
  let holdInt = 0;
  const stopHold = () => {
    clearTimeout(holdTimer);
    clearInterval(holdInt);
  };
  function stepOnce(btn) {
    const st = btn.closest('.stepper');
    const key = st.dataset.key;
    const cur = Number(get(key)) || 0;
    const v = clamp(cur + Number(st.dataset.step) * Number(btn.dataset.dir), Number(st.dataset.min), Number(st.dataset.max));
    if (v === cur) return;
    set(key, v);
    st.querySelector('output').textContent = fmtStep(v, st.dataset.fmt, st.dataset.unit);
    haptic(5);
  }
  root.addEventListener('pointerdown', (e) => {
    const btn = e.target.closest('.stepper [data-dir]');
    if (!btn) return;
    stepOnce(btn);
    stopHold();
    holdTimer = setTimeout(() => (holdInt = setInterval(() => stepOnce(btn), 80)), 450);
    const end = () => {
      stopHold();
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
    };
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
    btn.addEventListener('pointerleave', end, { once: true });
  });
  root.addEventListener('click', (e) => {
    const stepBtn = e.target.closest('.stepper [data-dir]');
    if (stepBtn) {
      if (e.detail === 0) stepOnce(stepBtn); // keyboard activation
      return;
    }
    const sw = e.target.closest('.switch[data-key]');
    if (sw) {
      const v = sw.getAttribute('aria-checked') !== 'true';
      sw.setAttribute('aria-checked', String(v));
      set(sw.dataset.key, v);
      haptic(5);
      return;
    }
    const opt = e.target.closest('.seg[data-key] > button');
    if (opt) {
      const seg = opt.parentElement;
      for (const b of seg.children) b.setAttribute('aria-checked', String(b === opt));
      set(seg.dataset.key, parseVal(opt.dataset.v));
      haptic(5);
    }
  });
  root.addEventListener('input', (e) => {
    const t = e.target;
    if (t.matches('input[type=range][data-key]')) set(t.dataset.key, parseFloat(t.value));
  });
  root.addEventListener('change', (e) => {
    const t = e.target;
    if (t.matches('select[data-key]')) set(t.dataset.key, parseVal(t.value));
  });
}
