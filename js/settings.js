import { data, save, saveSoon, emit, on, replaceAll, resetAll, catById, dayKey } from './store.js';
import { THEMES, FONTS, SOUNDS, APP_VERSION, themeColors, fontById } from './config.js';
import { sheet, icon, switchEl, segEl, stepperEl, bindControls, toast, confirmDialog } from './ui.js';
import { makeFace, FACES } from './faces.js';
import * as engine from './engine.js';
import * as audio from './audio.js';
import * as pwa from './pwa.js';
import { is24 } from './home.js';
import { esc, getPath, setPath, hms, pad, downloadFile } from './util.js';

const BG_SOUNDS = [
  ['silent', 'Silent (recommended)'],
  ['brown', 'Brown noise'],
  ['pink', 'Pink noise'],
  ['white', 'White noise'],
  ['off', 'Off'],
];

const group = (title, inner, cls = '') =>
  `<section class="set-sec"><h3 class="group-title">${title}</h3><div class="group ${cls}">${inner}</div></section>`;
const row = (label, ctl, hint = '') =>
  `<div class="row"><div class="row-label">${label}${hint ? `<small>${hint}</small>` : ''}</div><div class="row-ctl">${ctl}</div></div>`;
const range = (key, min, max, step, label) =>
  `<input type="range" data-key="${key}" min="${min}" max="${max}" step="${step}" value="${getPath(data.settings, key)}" aria-label="${esc(label)}">`;

const COLOR_ROWS = [
  ['bg', 'Background'],
  ['card', 'Cards'],
  ['digit', 'Digits'],
  ['accent', 'Accent'],
];

function hourLabel(h) {
  if (h === 0) return 'Midnight';
  return new Date(2000, 0, 1, h).toLocaleTimeString([], { hour: 'numeric' });
}

export function openSettings() {
  let offFit = null;
  let iv = 0;
  let tileRO = null;
  const pg = sheet({
    title: 'Settings',
    kind: 'page',
    body: '<div class="settings"></div>',
    onClose: () => {
      offFit?.();
      clearInterval(iv);
      tileRO?.disconnect();
    },
  });
  const root = pg.body.querySelector('.settings');

  const themeTile = (id, t, name) =>
    `<button class="theme-tile" data-theme="${id}" aria-pressed="${data.settings.theme === id}" style="--tb:${esc(t.bg)};--tc:${esc(t.card)};--td:${esc(t.digit)};--ta:${esc(t.accent)}">
      <span class="tt-card">25</span><span class="tt-name">${esc(name)}</span></button>`;

  const fontTile = (f) =>
    `<button class="font-tile" data-font="${f.id}" aria-pressed="${data.settings.font === f.id}">
      <span class="ft-num" style="font-family:${esc(f.family)};font-weight:${f.weight}">25</span><span class="ft-name">${esc(f.name)}</span></button>`;

  function notifCtl() {
    if (!('Notification' in window)) return '<span class="muted">Not supported</span>';
    if (Notification.permission === 'granted') return '<span class="muted">On</span>';
    if (Notification.permission === 'denied') return '<span class="muted">Blocked</span>';
    return '<button class="btn sm" data-notif>Turn on</button>';
  }

  function installRow() {
    if (pwa.isStandalone()) return row('App', '<span class="muted">Installed ✓</span>');
    if (pwa.canPromptInstall()) return row('Install app', '<button class="btn sm primary" data-install>Install</button>', 'Adds Focus to your home screen and works offline');
    if (pwa.isIOS()) return row('Install app', '', 'In Safari tap the Share button, then “Add to Home Screen”.');
    return row('Install app', '', 'Open your browser menu and choose “Install app” or “Add to Home screen”.');
  }

  function html() {
    const s = data.settings;
    const c = themeColors(s);
    const p = s.pomo;
    return `
      <div class="preview"><div class="clock preview-clock"></div></div>

      ${group(
        'Clock style',
        `<div class="face-tiles">${FACES.map(
          ([id, name]) =>
            `<button class="face-tile" data-face="${id}" aria-pressed="${s.face === id}"><span class="clock face-mini"></span><span class="ft-name">${esc(name)}</span></button>`
        ).join('')}</div>`,
        'pad'
      )}

      ${group('Theme', `<div class="themes">${Object.entries(THEMES).map(([id, t]) => themeTile(id, t, t.name)).join('')}${themeTile('custom', s.custom, 'Custom')}</div>`, 'pad')}
      ${group(
        'Colours',
        COLOR_ROWS.map(([k, label]) =>
          row(label, `<label class="color-in" style="--c:${esc(c[k])}"><input type="color" data-color="${k}" value="${esc(c[k])}" aria-label="${label} colour"></label>`)
        ).join('')
      )}

      ${group('Digit font', `<div class="fonts">${FONTS.map(fontTile).join('')}</div>`, 'pad')}
      ${group(
        'Clock style',
        row('Digit size', range('digitScale', 0.8, 1.2, 0.01, 'Digit size')) +
          row('Corner roundness', range('radius', 0, 0.25, 0.005, 'Corner roundness')) +
          row('Hinge line', switchEl('hinge', s.hinge, 'Hinge line')) +
          row('Flip animation', switchEl('flip', s.flip, 'Flip animation')) +
          row('Flip sound', switchEl('tick', s.tick, 'Flip sound'), 'A soft click each time a card flips')
      )}

      ${group(
        'Display',
        row('Show', segEl('format', s.format, [['auto', 'Auto'], ['hms', 'H M S'], ['hm', 'H M']], 'Digits shown'), 'Auto: minutes and seconds first, the hours card joins after an hour') +
          row('Stopwatch shows', segEl('display', s.display, [['session', 'Session'], ['today', 'Today']], 'Stopwatch shows'), 'This session, or everything today in the category') +
          row('Layout', segEl('layout', s.layout, [['auto', 'Auto'], ['row', 'Wide'], ['col', 'Tall']], 'Layout')) +
          row('Full-screen clock while running', switchEl('autoHide', s.autoHide, 'Full-screen clock while running'), 'Buttons hide and the cards fill the screen. Tap anywhere for options.')
      )}

      ${group(
        'Screen off & background',
        row(
          'Keep running with screen off',
          `<select class="select" data-key="bgSound" aria-label="Background sound">${BG_SOUNDS.map(([v, l]) => `<option value="${v}"${s.bgSound === v ? ' selected' : ''}>${l}</option>`).join('')}</select>`,
          'Plays a track the phone treats like music, so the clock keeps ticking, alarms ring on time and the lock screen shows play/pause. “Silent” can’t be heard. Other music apps may pause.'
        ) +
          row('Focus sound volume', range('ambientVol', 0.05, 1, 0.05, 'Focus sound volume'), 'For brown, pink and white noise') +
          row('Keep screen on', switchEl('wakeLock', s.wakeLock, 'Keep screen on'), 'While a clock is running and the app is open')
      )}

      ${group(
        'Home clock',
        row('24-hour time', switchEl('clock24', is24(), '24-hour time')) + row('Show seconds', switchEl('clockSeconds', s.clockSeconds, 'Show seconds'))
      )}

      ${group(
        'Pomodoro',
        row('Focus', stepperEl('pomo.focus', p.focus, { min: 1, max: 180, unit: 'min' }, 'focus')) +
          row('Short break', stepperEl('pomo.short', p.short, { min: 1, max: 60, unit: 'min' }, 'short break')) +
          row('Long break', stepperEl('pomo.long', p.long, { min: 1, max: 90, unit: 'min' }, 'long break')) +
          row('Long break every', stepperEl('pomo.every', p.every, { min: 2, max: 12, unit: 'rounds' }, 'rounds')) +
          row('Auto-start breaks', switchEl('pomo.autoBreak', p.autoBreak, 'Auto-start breaks')) +
          row('Auto-start focus', switchEl('pomo.autoFocus', p.autoFocus, 'Auto-start focus'))
      )}

      ${group(
        'Alerts',
        row(
          'Alarm sound',
          `<div class="inline"><select class="select" data-key="sound" aria-label="Alarm sound">${SOUNDS.map(([v, l]) => `<option value="${v}"${s.sound === v ? ' selected' : ''}>${l}</option>`).join('')}</select>
           <button class="icon-btn" data-test-sound aria-label="Play sound">${icon('sound')}</button></div>`
        ) +
          row('Volume', range('volume', 0, 1, 0.05, 'Volume')) +
          row('Vibration', switchEl('vibrate', s.vibrate, 'Vibration')) +
          row('Notifications', `<span data-notif-slot>${notifCtl()}</span>`, 'Alert when a timer ends while the app is in the background')
      )}

      ${group(
        'Tracking',
        row('Daily goal (all)', stepperEl('goal', s.goal, { min: 0, max: 1440, step: 15, fmt: 'goal' }, 'daily goal'), 'Auto adds up your category goals') +
          row('Week starts on', segEl('weekStart', s.weekStart, [[1, 'Mon'], [0, 'Sun'], [6, 'Sat']], 'Week starts on')) +
          row(
            'New day starts at',
            `<select class="select" data-key="dayStart" aria-label="New day starts at">${[0, 1, 2, 3, 4, 5, 6].map((h) => `<option value="${h}"${s.dayStart === h ? ' selected' : ''}>${hourLabel(h)}</option>`).join('')}</select>`,
            'Late-night study counts toward the previous day'
          ) +
          row('Keep sessions longer than', segEl('minSave', s.minSave, [[0, 'Any'], [30, '30s'], [60, '1m'], [300, '5m']], 'Minimum session'))
      )}

      ${group(
        'Your data',
        `<div class="data-btns">
          <button class="btn" data-export>${icon('download')}<span>Back up</span></button>
          <button class="btn" data-import>${icon('upload')}<span>Restore</span></button>
          <button class="btn" data-csv>${icon('download')}<span>Export CSV</span></button>
          <button class="btn danger" data-erase>${icon('trash')}<span>Erase all</span></button>
        </div>
        <p class="hint small">Everything is stored on this device only. Back up now and then, or before switching phones.</p>
        <input type="file" accept="application/json,.json" data-file hidden>`,
        'pad'
      )}

      ${group('App', installRow() + row('Privacy', '<a class="btn sm" href="privacy.html" target="_blank" rel="noopener">Privacy policy</a>', 'Your data stays on this device') + row('Version', `<span class="muted">${APP_VERSION}</span>`))}
      <p class="footnote">Keys: 1–5 switch tabs · Space start/pause · R reset · E edit</p>`;
  }

  /* ---------- live preview ---------- */

  function mountPreview() {
    const el = root.querySelector('.preview-clock');
    let face = null;
    const size = () => {
      const W = Math.min(el.parentElement.clientWidth, 420);
      el.style.width = `${W}px`;
      el.style.height = `${Math.round(W * (face?.type === 'ring' ? 0.62 : 0.44))}px`;
      face?.fit({ W, H: el.clientHeight, row: true, stretch: false });
    };
    const draw = (animate) => {
      if (face?.type !== data.settings.face) {
        face = makeFace(el, data.settings.face);
        draw(false);
        size();
        return;
      }
      const ms = engine.displayMs();
      const [, m, sec] = hms(ms, engine.isCountdown());
      face.render([pad(m), pad(sec)], { animate, running: true, progress: (ms % 60000) / 60000, label: 'Preview' });
    };
    draw(false);
    clearInterval(iv);
    iv = setInterval(() => draw(true), 250);
    offFit?.();
    offFit = on('fit', () => {
      size();
      drawFaceTiles(); // re-measure once web fonts have loaded
    });
    drawFaceTiles();
    document.fonts?.ready.then(() => root.isConnected && drawFaceTiles());
  }

  /** Each style tile shows a real, tiny version of that clock face, re-fitted whenever the tile resizes. */
  function drawFaceTiles() {
    tileRO?.disconnect();
    const fitMini = (el) => el.clientWidth && el._face?.fit({ W: el.clientWidth, H: el.clientHeight, row: true, stretch: false });
    tileRO = new ResizeObserver((entries) => entries.forEach((e) => fitMini(e.target)));
    for (const tile of root.querySelectorAll('.face-tile')) {
      const el = tile.querySelector('.face-mini');
      el._face = makeFace(el, tile.dataset.face);
      el._face.render(['12', '34'], { animate: false, running: false, progress: 0.62, label: '' });
      fitMini(el);
      tileRO.observe(el);
    }
  }

  function render() {
    root.innerHTML = html();
    mountPreview();
  }

  function refreshThemeUI() {
    const s = data.settings;
    const c = themeColors(s);
    root.querySelectorAll('.theme-tile').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.theme === s.theme)));
    const custom = root.querySelector('.theme-tile[data-theme="custom"]');
    for (const [k, v] of Object.entries({ tb: s.custom.bg, tc: s.custom.card, td: s.custom.digit, ta: s.custom.accent })) custom.style.setProperty(`--${k}`, v);
    root.querySelectorAll('input[data-color]').forEach((inp) => {
      inp.value = c[inp.dataset.color];
      inp.parentElement.style.setProperty('--c', c[inp.dataset.color]);
    });
  }

  const changed = () => {
    saveSoon();
    emit('settings');
  };

  bindControls(root, {
    get: (k) => getPath(data.settings, k),
    set: (k, v) => {
      setPath(data.settings, k, v);
      if (k.startsWith('pomo.')) engine.syncIdle();
      if (k === 'sound') audio.playSound(v);
      changed();
    },
  });

  let volTimer = 0;
  root.addEventListener('input', (e) => {
    const t = e.target;
    if (t.matches('input[data-color]')) {
      const s = data.settings;
      s.custom = { ...themeColors(s), [t.dataset.color]: t.value };
      s.theme = 'custom';
      refreshThemeUI();
      changed();
    }
    if (t.matches('[data-key="volume"]')) {
      clearTimeout(volTimer);
      volTimer = setTimeout(() => audio.playSound(data.settings.sound === 'none' ? 'chime' : data.settings.sound), 250);
    }
  });

  root.addEventListener('click', async (e) => {
    const s = data.settings;
    const th = e.target.closest('[data-theme]');
    if (th) {
      s.theme = th.dataset.theme;
      refreshThemeUI();
      return changed();
    }
    const fc = e.target.closest('.face-tile');
    if (fc) {
      s.face = fc.dataset.face;
      root.querySelectorAll('.face-tile').forEach((b) => b.setAttribute('aria-pressed', String(b === fc)));
      return changed();
    }
    const ft = e.target.closest('[data-font]');
    if (ft) {
      s.font = ft.dataset.font;
      root.querySelectorAll('.font-tile').forEach((b) => b.setAttribute('aria-pressed', String(b === ft)));
      return changed();
    }
    if (e.target.closest('[data-test-sound]')) {
      audio.unlock();
      return audio.playSound(s.sound === 'none' ? 'chime' : s.sound);
    }
    if (e.target.closest('[data-notif]')) {
      await Notification.requestPermission().catch(() => {});
      root.querySelector('[data-notif-slot]').innerHTML = notifCtl();
      return;
    }
    if (e.target.closest('[data-install]')) {
      await pwa.promptInstall();
      return render();
    }
    if (e.target.closest('[data-export]')) {
      downloadFile(`focus-backup-${dayKey(Date.now())}.json`, JSON.stringify(data), 'application/json');
      return toast('Backup downloaded');
    }
    if (e.target.closest('[data-import]')) return root.querySelector('[data-file]').click();
    if (e.target.closest('[data-csv]')) return exportCsv();
    if (e.target.closest('[data-erase]')) {
      const ok = await confirmDialog({
        title: 'Erase everything?',
        message: 'All sessions, categories and settings will be deleted from this device. This can’t be undone.',
        ok: 'Erase',
        danger: true,
      });
      if (!ok) return;
      resetAll();
      emit('settings');
      render();
      toast('All data erased');
    }
  });

  root.addEventListener('change', async (e) => {
    if (!e.target.matches('[data-file]')) return;
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    let obj;
    try {
      obj = JSON.parse(await file.text());
    } catch {
      return toast('That file isn’t a Focus backup');
    }
    if (!obj || !Array.isArray(obj.sessions) || !Array.isArray(obj.cats)) return toast('That file isn’t a Focus backup');
    const ok = await confirmDialog({
      title: 'Restore this backup?',
      message: `It has ${obj.sessions.length} sessions in ${obj.cats.length} categories and will replace what’s on this device now.`,
      ok: 'Restore',
      danger: true,
    });
    if (!ok) return;
    replaceAll(obj);
    emit('settings');
    render();
    toast('Backup restored');
  });

  function exportCsv() {
    const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const rows = [['date', 'start', 'end', 'minutes', 'category', 'mode', 'note']];
    const sorted = [...data.sessions].sort((a, b) => a.start - b.start);
    for (const s of sorted) {
      const segs = s.segs;
      const end = segs.length ? segs[segs.length - 1][1] : s.start;
      const dur = Math.max(0, segs.reduce((a, [x, y]) => a + y - x, 0) + (s.adj || 0));
      const st = new Date(s.start);
      rows.push([
        dayKey(s.start),
        st.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }),
        new Date(end).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }),
        (dur / 60000).toFixed(1),
        catById(s.cat).name,
        s.mode,
        s.note || '',
      ]);
    }
    downloadFile(`focus-sessions-${dayKey(Date.now())}.csv`, rows.map((r) => r.map(q).join(',')).join('\n'), 'text/csv');
    toast('CSV downloaded');
  }

  render();
}
