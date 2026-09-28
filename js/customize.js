// Customize: every template, clock style, font and colour, on a page of its own.
// which = 'main' edits the stopwatch, timer and Pomodoro look (its theme stays on the simple
// Looks panel); which = 'home' edits Home's own look, theme included, once Home has one.
import { data, saveSoon, emit, on, lookOf, lookTarget, pushScope } from './store.js';
import { FONTS, FACE_COLORS, AURORAS, LOOK_KEYS, themeColors } from './config.js';
import { sheet, switchEl, segEl, bindControls, haptic } from './ui.js';
import { makeFace, FACES } from './faces.js';
import { templatesHtml, drawTemplates, markTemplates, markThemes, themesHtml, homeLookHtml, applyTemplate, setLook, setHomeOwnLook, mountPreview } from './looks.js';
import { esc, getPath, setPath } from './util.js';

const group = (title, inner, cls = '') =>
  `<section class="set-sec">${title ? `<h3 class="group-title">${title}</h3>` : ''}<div class="group ${cls}">${inner}</div></section>`;
const row = (label, ctl, hint = '') =>
  `<div class="row"><div class="row-label">${label}${hint ? `<small>${hint}</small>` : ''}</div><div class="row-ctl">${ctl}</div></div>`;

const COLOR_ROWS = [
  ['bg', 'Background'],
  ['card', 'Cards'],
  ['digit', 'Digits'],
  ['accent', 'Accent'],
];

export function openCustomize({ which = 'main', onClose } = {}) {
  const home = which === 'home';
  let tileRO = null;
  let tplCleanup = null;
  let previewCleanup = null;
  let offFit = null;
  const pop = pushScope(which); // the app wears this look while the page is open
  const pg = sheet({
    title: home ? 'Home clock' : 'Customize',
    kind: 'page',
    cls: 'customize-page',
    body: '<div class="customize"></div>',
    onClose: () => {
      tileRO?.disconnect();
      tplCleanup?.();
      previewCleanup?.();
      offFit?.();
      pop();
      onClose?.();
    },
  });
  const root = pg.body.querySelector('.customize');
  const L = () => lookOf(which); // what the look is now
  const T = () => lookTarget(which); // where changes go
  const own = () => !home || !!data.settings.homeLook;

  const range = (key, min, max, step, label) =>
    `<input type="range" data-key="${key}" min="${min}" max="${max}" step="${step}" value="${getPath(L(), key)}" aria-label="${esc(label)}">`;

  const swatches = () =>
    `<div class="swatches sm">${FACE_COLORS.map(
      ([v, n]) =>
        `<button class="swatch${v === 'auto' ? ' auto' : ''}" data-fcolor="${v}" style="--c:${v === 'auto' ? 'transparent' : v}" title="${n}" aria-label="${n}" aria-pressed="${L().faceColor === v}"></button>`
    ).join('')}</div>`;

  const fontTile = (f) =>
    `<button class="font-tile" data-font="${f.id}" aria-pressed="${L().font === f.id}">
      <span class="ft-num" style="font-family:${esc(f.family)};font-weight:${f.weight}">25</span><span class="ft-name">${esc(f.name)}</span></button>`;

  /** Options that only make sense for the chosen clock style. */
  function styleOptionsHtml() {
    const s = L();
    const name = (FACES.find(([id]) => id === s.face) || FACES[0])[1];
    const colour = (label) => `<div class="row"><div class="row-label">${label}</div><div class="row-ctl wide">${swatches()}</div></div>`;
    const glow = row('Glow', range('glow', 0, 1, 0.05, 'Glow'));
    const blink = row('Blinking colon', switchEl('blink', s.blink !== false, 'Blinking colon'));
    const ghost = (label) => row(label, switchEl('ghost', s.ghost !== false, label));
    const ticks = row('Tick marks', switchEl('ticks', s.ticks !== false, 'Tick marks'));
    const rows = {
      flip:
        row('Flip speed', segEl('flipSpeed', s.flipSpeed || 'normal', [['slow', 'Slow'], ['normal', 'Normal'], ['fast', 'Fast']], 'Flip speed')) +
        row('Flip animation', switchEl('flip', s.flip !== false, 'Flip animation')) +
        row('Card depth', switchEl('shade', !!s.shade, 'Card depth'), 'Soft light on the top half, shadow on the bottom') +
        row('Hinge line', switchEl('hinge', s.hinge !== false, 'Hinge line')),
      minimal: blink,
      neon: colour('Tube colour') + glow + blink,
      aurora: row('Palette', segEl('aurora', s.aurora || 'ocean', AURORAS, 'Aurora palette')) + blink,
      led: colour('Segment colour') + glow + ghost('Show unlit segments') + blink,
      dots: colour('Dot colour') + glow + ghost('Show unlit dots') + blink,
      nixie: colour('Tube colour') + glow + ghost('Show unlit digits') + blink,
      ring: colour('Ring colour') + ticks,
      analog: colour('Second hand colour') + ticks,
    };
    return group(`${esc(name)} options`, rows[s.face] || rows.flip);
  }

  function html() {
    const s = L();
    const c = themeColors(s);
    const ownSwitch = home
      ? group('', row('Own look for Home', switchEl('ownLook', own(), 'Own look for Home'), own() ? 'Home has its own template, style, colours and font' : 'Off: Home looks the same as your stopwatch and timers'))
      : '';
    if (!own()) {
      return `<div class="preview"><div class="clock preview-clock"></div></div>${ownSwitch}
        <p class="hint small center own-hint">Turn it on to give Home its own template, clock style, theme, colours and font. Your stopwatch and timers keep theirs.</p>`;
    }
    return `
      <div class="preview"><div class="clock preview-clock"></div></div>
      ${ownSwitch}
      ${group(home ? 'Templates' : 'All templates', templatesHtml(undefined, '', which), 'pad')}
      ${home ? group('Theme', themesHtml(which), 'pad') : ''}
      ${group(
        'Clock style',
        `<div class="face-tiles">${FACES.map(
          ([id, name]) => `<button class="face-tile" data-face="${id}" aria-pressed="${s.face === id}"><span class="clock face-mini"></span><span class="ft-name">${esc(name)}</span></button>`
        ).join('')}</div>`,
        'pad'
      )}
      <div class="style-opts">${styleOptionsHtml()}</div>
      ${group('Digit font', `<div class="fonts">${FONTS.map(fontTile).join('')}</div>`, 'pad')}
      ${group(
        'Your own colours',
        COLOR_ROWS.map(([k, label]) =>
          row(label, `<label class="color-in" style="--c:${esc(c[k])}"><input type="color" data-color="${k}" value="${esc(c[k])}" aria-label="${label} colour"></label>`)
        ).join('')
      )}
      ${group(
        'Details',
        row('Digit size', range('digitScale', 0.8, 1.2, 0.01, 'Digit size')) +
          row('Corner roundness', range('radius', 0, 0.25, 0.005, 'Corner roundness'), 'Flip cards') +
          row('Background', segEl('backdrop', s.backdrop || 'none', [['none', 'None'], ['glow', 'Glow'], ['gradient', 'Gradient']], 'Background'), 'Soft light behind the clock') +
          (home ? '' : row('Tick sound', switchEl('tick', data.settings.tick, 'Tick sound'), 'A soft click every second while running'))
      )}
      ${home ? '' : `<section class="set-sec"><h3 class="group-title">Home</h3><div class="home-look-slot">${homeLookHtml()}</div></section>`}`;
  }

  /** Each style tile shows a real, tiny version of that clock face, re-fitted whenever the tile resizes. */
  function drawFaceTiles() {
    tileRO?.disconnect();
    const fitMini = (el) => el.clientWidth && el._face?.fit({ W: el.clientWidth, H: el.clientHeight, row: true, stretch: false });
    tileRO = new ResizeObserver((entries) => entries.forEach((e) => fitMini(e.target)));
    for (const tile of root.querySelectorAll('.face-tile')) {
      const el = tile.querySelector('.face-mini');
      el._face = makeFace(el, tile.dataset.face, { settings: L });
      el._face.render(['12', '34'], { animate: false, running: false, progress: 0.62, label: '', ms: 754000, date: new Date(2020, 0, 1, 10, 9, 34) });
      fitMini(el);
      tileRO.observe(el);
    }
  }

  function render() {
    root.innerHTML = html();
    previewCleanup?.();
    previewCleanup = mountPreview(root.querySelector('.preview-clock'), { which });
    tplCleanup?.();
    tplCleanup = drawTemplates(root);
    drawFaceTiles();
  }

  /** Brings every control in line with the look after a template or theme change. */
  function sync() {
    if (!root.querySelector('.face-tiles')) return;
    const s = L();
    const c = themeColors(s);
    markTemplates(root, which);
    markThemes(root, which);
    root.querySelectorAll('.face-tile').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.face === s.face)));
    drawFaceTiles();
    root.querySelectorAll('.font-tile').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.font === s.font)));
    root.querySelector('.style-opts').innerHTML = styleOptionsHtml();
    root.querySelectorAll('input[data-color]').forEach((inp) => {
      inp.value = c[inp.dataset.color];
      inp.parentElement.style.setProperty('--c', c[inp.dataset.color]);
    });
    root.querySelectorAll('input[type="range"][data-key]').forEach((r) => (r.value = getPath(s, r.dataset.key)));
    root.querySelectorAll('.seg[data-key]').forEach((sg) => {
      const v = String(getPath(s, sg.dataset.key));
      sg.querySelectorAll('[data-v]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.v === v)));
    });
  }

  const changed = () => {
    saveSoon();
    emit('settings');
  };
  /** A hand-made change: this look is no longer an untouched template. */
  const lookChanged = () => {
    T().template = null;
    markTemplates(root, which);
  };

  bindControls(root, {
    get: (k) => (k === 'ownLook' ? own() : getPath(LOOK_KEYS.has(k) ? L() : data.settings, k)),
    set: (k, v) => {
      if (k === 'ownLook') {
        setHomeOwnLook(v);
        return render();
      }
      if (LOOK_KEYS.has(k)) {
        setPath(T(), k, v);
        lookChanged();
      } else setPath(data.settings, k, v);
      changed();
    },
  });

  root.addEventListener('input', (e) => {
    const t = e.target;
    if (!t.matches('input[data-color]')) return;
    const target = T();
    target.custom = { ...themeColors(L()), [t.dataset.color]: t.value };
    target.theme = 'custom';
    t.parentElement.style.setProperty('--c', t.value);
    lookChanged();
    markThemes(root, which);
    changed();
  });

  root.addEventListener('click', (e) => {
    const tpl = e.target.closest('[data-tpl]');
    if (tpl) {
      haptic(8);
      applyTemplate(tpl.dataset.tpl, which);
      return sync();
    }
    const th = e.target.closest('[data-theme]');
    if (th) {
      haptic(6);
      setLook({ theme: th.dataset.theme }, which);
      return sync();
    }
    if (e.target.closest('[data-home-look]')) {
      return openCustomize({
        which: 'home',
        onClose: () => {
          const slot = root.querySelector('.home-look-slot');
          if (slot) slot.innerHTML = homeLookHtml();
        },
      });
    }
    const fc = e.target.closest('.face-tile');
    if (fc) {
      T().face = fc.dataset.face;
      lookChanged();
      root.querySelectorAll('.face-tile').forEach((b) => b.setAttribute('aria-pressed', String(b === fc)));
      root.querySelector('.style-opts').innerHTML = styleOptionsHtml();
      return changed();
    }
    const col = e.target.closest('[data-fcolor]');
    if (col) {
      T().faceColor = col.dataset.fcolor;
      lookChanged();
      col.parentElement.querySelectorAll('[data-fcolor]').forEach((b) => b.setAttribute('aria-pressed', String(b === col)));
      return changed();
    }
    const ft = e.target.closest('[data-font]');
    if (ft) {
      T().font = ft.dataset.font;
      lookChanged();
      root.querySelectorAll('.font-tile').forEach((b) => b.setAttribute('aria-pressed', String(b === ft)));
      return changed();
    }
  });

  render();
  offFit = on('fit', drawFaceTiles);
}
