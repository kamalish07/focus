// Looks: four templates up front, the colour theme, and a door to everything else
// (all templates, clock styles, fonts, colours) on the Customize page.
import { data, saveSoon, emit, on } from './store.js';
import { TEMPLATES, THEMES, LOOK_DEFAULTS, templateLook, fontById } from './config.js';
import { makeFace, homeFaceType } from './faces.js';
import { is24 } from './home.js';
import { sheet, icon, haptic, toast } from './ui.js';
import * as engine from './engine.js';
import { esc, hms, pad } from './util.js';

const SAMPLE = { date: new Date(2020, 0, 1, 10, 9, 34), ms: 12 * 60000 + 34000 };
const FEATURED = ['classic', 'nixie', 'aurora', 'watch'];

export function applyTemplate(id) {
  const t = TEMPLATES.find((x) => x.id === id);
  if (!t) return;
  Object.assign(data.settings, LOOK_DEFAULTS, t.look, { template: id });
  saveSoon();
  emit('settings');
}

/** A hand-made change to the look: it's no longer an untouched template. */
export function setLook(patch) {
  Object.assign(data.settings, patch, { template: null });
  saveSoon();
  emit('settings');
}

/** The four shown up front. The template you're using always stays in view. */
export function featuredTemplates() {
  const ids = [...FEATURED];
  const cur = data.settings.template;
  if (cur && !ids.includes(cur) && TEMPLATES.some((t) => t.id === cur)) ids[3] = cur;
  return ids.map((id) => TEMPLATES.find((t) => t.id === id));
}

function tplTile(t) {
  const look = templateLook(t);
  const c = THEMES[look.theme] || THEMES.classic;
  const f = fontById(look.font);
  const vars = [
    `--bg:${c.bg}`,
    `--card:${c.card}`,
    `--digit:${c.digit}`,
    `--accent:${c.accent}`,
    `--face:${look.faceColor !== 'auto' ? look.faceColor : 'initial'}`, // 'initial' = use the style's own colour
    `--glow:${look.glow}`,
    `--digit-font:${f.family}`,
    `--digit-weight:${f.weight}`,
    `--ls:${f.ls || 0}em`,
  ].join(';');
  const cls = ['tpl', 'themed', look.shade ? 'card-shade' : '', `bd-${look.backdrop}`].join(' ');
  return `<button class="${cls}" data-tpl="${t.id}" aria-pressed="${data.settings.template === t.id}" style="${esc(vars)}">
      <span class="clock tpl-mini"></span><span class="tpl-name">${esc(t.name)}</span></button>`;
}

/** Template buttons; call drawTemplates(container) once they're in the page. */
export function templatesHtml(list = TEMPLATES, cls = '') {
  return `<div class="tpls ${cls}">${list.map(tplTile).join('')}</div>`;
}

/** The way into the Customize page: a fan of other looks, so it's clear there's more. */
export function moreLooksHtml() {
  const fan = ['neon', 'bedside', 'mint'].map((id, i) => {
    const look = templateLook(TEMPLATES.find((t) => t.id === id));
    const c = THEMES[look.theme] || THEMES.classic;
    const ink = look.faceColor !== 'auto' ? look.faceColor : c.digit;
    return `<i style="--b:${esc(c.bg)};--d:${esc(ink)};--f:${esc(fontById(look.font).family)}">${'739'[i]}</i>`;
  });
  const more = TEMPLATES.length - FEATURED.length;
  return `<button class="more-looks" data-more>
      <span class="ml-fan" aria-hidden="true">${fan.join('')}<span class="ml-badge">${icon('settings')}</span></span>
      <span class="ml-text"><span class="ml-title">More looks</span><span class="ml-sub">${more} more templates, clock styles, fonts and colours</span></span>
      ${icon('chevronRight', 'ml-chev')}
    </button>`;
}

const themeTile = (id, t, name) =>
  `<button class="theme-tile" data-theme="${id}" aria-pressed="${data.settings.theme === id}" style="--tb:${esc(t.bg)};--tc:${esc(t.card)};--td:${esc(t.digit)};--ta:${esc(t.accent)}">
    <span class="tt-card">25</span><span class="tt-name">${esc(name)}</span></button>`;

/** Colour themes in one swipeable row. Your own colours join the row once you've made them. */
export function themesHtml() {
  const s = data.settings;
  const custom = s.theme === 'custom' ? themeTile('custom', s.custom, 'Custom') : '';
  return `<div class="themes strip">${custom}${Object.entries(THEMES).map(([id, t]) => themeTile(id, t, t.name)).join('')}</div>`;
}

/** Fills each template tile with a real mini clock and keeps it fitted. Returns a cleanup function. */
export function drawTemplates(container) {
  const fitMini = (el) => el.clientWidth && el._face?.fit({ W: el.clientWidth, H: el.clientHeight, row: true, stretch: false });
  const ro = new ResizeObserver((entries) => entries.forEach((e) => fitMini(e.target)));
  for (const tile of container.querySelectorAll('.tpl')) {
    const t = TEMPLATES.find((x) => x.id === tile.dataset.tpl);
    const look = templateLook(t);
    const el = tile.querySelector('.tpl-mini');
    el._face = makeFace(el, look.face, { font: look.font, settings: { ...data.settings, ...look } });
    el._face.render(['12', '34'], { animate: false, running: false, progress: 0.62, label: '', ...SAMPLE });
    fitMini(el);
    ro.observe(el);
  }
  const redraw = () => container.isConnected && container.querySelectorAll('.tpl-mini').forEach(fitMini);
  document.fonts?.ready.then(redraw);
  return () => ro.disconnect();
}

export function markTemplates(container) {
  container.querySelectorAll('.tpl').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.tpl === data.settings.template)));
}

export function markThemes(container) {
  container.querySelectorAll('.theme-tile').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.theme === data.settings.theme)));
}

/**
 * The simple looks panel (templates, "More looks", theme) inside `box`.
 * Handles its own taps; `onMore` opens the Customize page. Returns { render, destroy }.
 */
export function looksPanel(box, { onMore, onApply } = {}) {
  let cleanup = null;
  function render() {
    cleanup?.();
    box.innerHTML = `${templatesHtml(featuredTemplates(), 'featured')}${moreLooksHtml()}
      <h3 class="looks-label">Theme</h3>${themesHtml()}`;
    cleanup = drawTemplates(box);
    // Bring the chosen theme into view within its row (without scrolling the page).
    const strip = box.querySelector('.themes');
    const sel = strip.querySelector('[aria-pressed="true"]');
    if (sel) strip.scrollLeft += sel.getBoundingClientRect().left - strip.getBoundingClientRect().left - (strip.clientWidth - sel.offsetWidth) / 2;
  }
  box.addEventListener('click', (e) => {
    const tpl = e.target.closest('[data-tpl]');
    if (tpl) {
      haptic(8);
      applyTemplate(tpl.dataset.tpl);
      markTemplates(box);
      markThemes(box);
      onApply?.(tpl.querySelector('.tpl-name').textContent);
      return;
    }
    const th = e.target.closest('[data-theme]');
    if (th) {
      haptic(6);
      setLook({ theme: th.dataset.theme });
      markTemplates(box);
      markThemes(box);
      return;
    }
    if (e.target.closest('[data-more]')) onMore?.();
  });
  render();
  return { render, destroy: () => cleanup?.() };
}

/** Quick picker from the palette button. */
export function openLooks({ onMore } = {}) {
  let panel = null;
  const sh = sheet({
    title: 'Looks',
    cls: 'looks-sheet',
    body: '<div class="looks-panel"></div>',
    onClose: () => panel?.destroy(),
  });
  panel = looksPanel(sh.body.querySelector('.looks-panel'), {
    onApply: (name) => toast(`${name} applied`, { ms: 1800 }),
    onMore: () => {
      sh.close();
      setTimeout(() => onMore?.(), 340);
    },
  });
}

/**
 * A live clock showing the current look, kept sized to its box. With `home()` true it shows
 * Home's clock (the time of day) instead of the timers'. Returns a cleanup function.
 */
export function mountPreview(el, { home = () => false } = {}) {
  let face = null;
  const type = () => (home() ? homeFaceType() : data.settings.face);
  const size = () => {
    const W = Math.min(el.parentElement.clientWidth, 420);
    const round = face && ['ring', 'analog'].includes(face.type);
    el.style.width = `${W}px`;
    el.style.height = `${Math.round(W * (round ? 0.62 : 0.44))}px`;
    face?.fit({ W, H: el.clientHeight, row: true, stretch: false });
  };
  const draw = (animate) => {
    if (face?.type !== type()) {
      face = makeFace(el, type());
      draw(false);
      size();
      return;
    }
    el.classList.toggle('home-look', home());
    if (home()) {
      const d = new Date();
      const h = is24() ? d.getHours() : d.getHours() % 12 || 12;
      face.render([pad(h), pad(d.getMinutes())], { animate, running: true, progress: d.getSeconds() / 60, label: is24() ? '' : d.getHours() < 12 ? 'AM' : 'PM', date: d });
      return;
    }
    const ms = engine.displayMs();
    const [, m, sec] = hms(ms, engine.isCountdown());
    face.render([pad(m), pad(sec)], { animate, running: true, progress: (ms % 60000) / 60000, label: 'Preview', ms });
  };
  draw(false);
  const iv = setInterval(() => draw(true), 200);
  const offFit = on('fit', size);
  return () => {
    clearInterval(iv);
    offFit();
  };
}
