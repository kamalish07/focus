import { data, saveSoon, emit, on, replaceAll, resetAll, catById, dayKey, pushScope } from './store.js';
import { SOUNDS, APP_VERSION } from './config.js';
import { sheet, icon, switchEl, segEl, stepperEl, bindControls, toast, confirmDialog } from './ui.js';
import { looksPanel, mountPreview } from './looks.js';
import { openCustomize } from './customize.js';
import { openCategories } from './sheets.js';
import * as engine from './engine.js';
import * as audio from './audio.js';
import * as pwa from './pwa.js';
import { is24 } from './home.js';
import { esc, getPath, setPath, downloadFile } from './util.js';

const BG_SOUNDS = [
  ['silent', 'Silent (recommended)'],
  ['brown', 'Brown noise'],
  ['pink', 'Pink noise'],
  ['white', 'White noise'],
  ['off', 'Off'],
];

const AREAS = [
  ['looks', 'Looks'],
  ['clock', 'Clock'],
  ['timers', 'Timers'],
  ['sound', 'Sound'],
  ['data', 'Data'],
];

const group = (title, inner, cls = '') =>
  `<section class="set-sec"><h3 class="group-title">${title}</h3><div class="group ${cls}">${inner}</div></section>`;
const row = (label, ctl, hint = '') =>
  `<div class="row"><div class="row-label">${label}${hint ? `<small>${hint}</small>` : ''}</div><div class="row-ctl">${ctl}</div></div>`;
const range = (key, min, max, step, label) =>
  `<input type="range" data-key="${key}" min="${min}" max="${max}" step="${step}" value="${getPath(data.settings, key)}" aria-label="${esc(label)}">`;

function hourLabel(h) {
  if (h === 0) return 'Midnight';
  return new Date(2000, 0, 1, h).toLocaleTimeString([], { hour: 'numeric' });
}

export function openSettings() {
  let previewCleanup = null;
  let looks = null;
  let areaIO = null;
  const pop = pushScope('main'); // Settings edits the stopwatch and timers' look, so it wears that one
  const pg = sheet({
    title: 'Settings',
    kind: 'page',
    body: '<div class="settings"></div>',
    onClose: () => {
      previewCleanup?.();
      looks?.destroy();
      areaIO?.disconnect();
      pop();
    },
  });
  const scroller = pg.body;
  const root = pg.body.querySelector('.settings');

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
    const p = s.pomo;
    return `
      <div class="preview"><div class="clock preview-clock"></div></div>
      <nav class="set-nav" aria-label="Settings sections">${AREAS.map(([id, l]) => `<button data-jump="${id}">${l}</button>`).join('')}</nav>

      <div class="set-area area-looks" data-area="looks">
        <section class="set-sec"><h3 class="group-title">Looks</h3><div class="group pad looks-panel"></div></section>
      </div>

      <div class="set-area" data-area="clock">
        ${group(
          'Display',
          row('Show', segEl('format', s.format, [['auto', 'Auto'], ['hms', 'H M S'], ['hm', 'H M']], 'Digits shown'), 'Auto: minutes and seconds first, the hours join after an hour') +
            row('Stopwatch shows', segEl('display', s.display, [['session', 'Session'], ['today', 'Today']], 'Stopwatch shows'), 'This session, or everything today in the category') +
            row('Layout', segEl('layout', s.layout, [['auto', 'Auto'], ['row', 'Wide'], ['col', 'Tall']], 'Layout')) +
            row('Full-screen clock while running', switchEl('autoHide', s.autoHide, 'Full-screen clock while running'), 'The clock fills the screen. Tap anywhere for controls.') +
            row('Details under the clock', switchEl('showInfo', !!s.showInfo, 'Details under the clock'), 'Start or end time and today’s total')
        )}
        ${group('Home clock', row('24-hour time', switchEl('clock24', is24(), '24-hour time')) + row('Show seconds', switchEl('clockSeconds', s.clockSeconds, 'Show seconds')))}
      </div>

      <div class="set-area" data-area="timers">
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
          'Screen off & background',
          row(
            'Keep running with screen off',
            `<select class="select" data-key="bgSound" aria-label="Background sound">${BG_SOUNDS.map(([v, l]) => `<option value="${v}"${s.bgSound === v ? ' selected' : ''}>${l}</option>`).join('')}</select>`,
            'Plays a track the phone treats like music, so the clock keeps ticking, alarms ring on time and the lock screen shows play/pause. “Silent” can’t be heard. Other music apps may pause.'
          ) +
            row('Focus sound volume', range('ambientVol', 0.05, 1, 0.05, 'Focus sound volume'), 'For brown, pink and white noise') +
            row('Keep screen on', switchEl('wakeLock', s.wakeLock, 'Keep screen on'), 'While a clock is running and the app is open')
        )}
      </div>

      <div class="set-area" data-area="sound">
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
      </div>

      <div class="set-area" data-area="data">
        ${group(
          'Tracking',
          row('Categories', '<button class="btn sm" data-cats>Edit</button>', 'Add, rename, recolour or delete') +
            row('Daily goal', stepperEl('goal', s.goal, { min: 0, max: 1440, step: 15, fmt: 'goal' }, 'daily goal'), 'Total focus time per day, all categories together') +
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
        <p class="footnote">Keys: 1 to 5 switch tabs · Space start/pause · R reset · E edit · F full screen</p>
      </div>`;
  }

  function render() {
    root.innerHTML = html();
    previewCleanup?.();
    previewCleanup = mountPreview(root.querySelector('.preview-clock'));
    looks?.destroy();
    const again = () => looks?.render();
    looks = looksPanel(root.querySelector('.looks-panel'), {
      onMore: () => openCustomize({ onClose: again }),
      onHome: () => openCustomize({ which: 'home', onClose: again }),
    });
    watchAreas();
  }

  /** Highlight the section you're reading in the sticky bar. */
  function watchAreas() {
    areaIO?.disconnect();
    const nav = root.querySelector('.set-nav');
    const mark = (id) => nav.querySelectorAll('[data-jump]').forEach((b) => b.setAttribute('aria-current', String(b.dataset.jump === id)));
    mark('looks');
    areaIO = new IntersectionObserver(
      (entries) => {
        const vis = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (vis) mark(vis.target.dataset.area);
      },
      { root: scroller, rootMargin: '-80px 0px -60% 0px' }
    );
    root.querySelectorAll('.set-area').forEach((a) => areaIO.observe(a));
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
    if (t.matches('[data-key="volume"]')) {
      clearTimeout(volTimer);
      volTimer = setTimeout(() => audio.playSound(data.settings.sound === 'none' ? 'chime' : data.settings.sound), 250);
    }
  });

  root.addEventListener('click', async (e) => {
    const s = data.settings;
    const jump = e.target.closest('[data-jump]');
    if (jump) {
      const area = root.querySelector(`[data-area="${jump.dataset.jump}"]`);
      area?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    if (e.target.closest('[data-cats]')) return openCategories();
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
