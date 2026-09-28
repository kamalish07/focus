// Looks: four templates up front, the colour theme, and doors to everything else: the
// Customize page (all templates, clock styles, fonts, colours) and Home's own look.
// `which` is the look being edited: 'main' (stopwatch, timer, Pomodoro) or 'home'.
import { data, saveSoon, emit, on, lookOf, lookTarget, pushScope } from './store.js';
import { TEMPLATES, THEMES, LOOK_DEFAULTS, templateLook, fontById, themeColors } from './config.js';
import { makeFace, FACES } from './faces.js';
import { is24 } from './home.js';
import { sheet, icon, haptic, toast } from './ui.js';
import * as engine from './engine.js';
import { esc, hms, pad } from './util.js';

const SAMPLE = { date: new Date(2020, 0, 1, 10, 9, 34), ms: 12 * 60000 + 34000 };
const FEATURED = ['classic', 'nixie', 'aurora', 'watch'];

export function applyTemplate(id, which = 'main') {
  const t = TEMPLATES.find((x) => x.id === id);
  if (!t) return;
  Object.assign(lookTarget(which), LOOK_DEFAULTS, t.look, { template: id });
  saveSoon();
  emit('settings');
}

/** A hand-made change to the look: it's no longer an untouched template. */
export function setLook(patch, which = 'main') {
  Object.assign(lookTarget(which), patch, { template: null });
  saveSoon();
  emit('settings');
}

/** Give Home a look of its own (starting as a copy of the timers'), or make it match them again. */
export function setHomeOwnLook(own) {
  const s = data.settings;
  if (own && !s.homeLook) {
    s.homeLook = {};
    for (const k of [...Object.keys(LOOK_DEFAULTS), 'custom', 'template']) s.homeLook[k] = k === 'custom' ? { ...s.custom } : s[k];
  } else if (!own) s.homeLook = null;
  saveSoon();
  emit('settings');
}

/** The four shown up front. The template you're using always stays in view. */
export function featuredTemplates(which = 'main') {
  const ids = [...FEATURED];
  const cur = lookOf(which).template;
  if (cur && !ids.includes(cur) && TEMPLATES.some((t) => t.id === cur)) ids[3] = cur;
  return ids.map((id) => TEMPLATES.find((t) => t.id === id));
}

function tplTile(t, selected) {
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
  return `<button class="${cls}" data-tpl="${t.id}" aria-pressed="${selected === t.id}" style="${esc(vars)}">
      <span class="clock tpl-mini"></span><span class="tpl-name">${esc(t.name)}</span></button>`;
}

/** Template buttons; call drawTemplates(container) once they're in the page. */
export function templatesHtml(list = TEMPLATES, cls = '', which = 'main') {
  const sel = lookOf(which).template;
  return `<div class="tpls ${cls}">${list.map((t) => tplTile(t, sel)).join('')}</div>`;
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

/** The way into Home's own look, drawn as a little dial in Home's colours. */
export function homeLookHtml() {
  const own = !!data.settings.homeLook;
  const L = lookOf('home');
  const c = themeColors(L);
  const style = (FACES.find(([id]) => id === L.face) || FACES[0])[1];
  const tpl = L.template && TEMPLATES.find((t) => t.id === L.template)?.name;
  return `<button class="more-looks home-look-card" data-home-look>
      <span class="hl-dial" aria-hidden="true" style="--b:${esc(c.card)};--d:${esc(c.digit)};--a:${esc(c.accent)}"><i class="hl-h"></i><i class="hl-m"></i><span class="ml-badge">${icon('home')}</span></span>
      <span class="ml-text"><span class="ml-title">Home clock</span><span class="ml-sub">${own ? `Its own look: ${esc(tpl || style)}` : 'Same as your timers. Tap to give it its own look'}</span></span>
      ${icon('chevronRight', 'ml-chev')}
    </button>`;
}

const themeTile = (id, t, name, sel) =>
  `<button class="theme-tile" data-theme="${id}" aria-pressed="${sel === id}" style="--tb:${esc(t.bg)};--tc:${esc(t.card)};--td:${esc(t.digit)};--ta:${esc(t.accent)}">
    <span class="tt-card">25</span><span class="tt-name">${esc(name)}</span></button>`;

/** Colour themes in one swipeable row. Your own colours join the row once you've made them. */
export function themesHtml(which = 'main') {
  const L = lookOf(which);
  const custom = L.theme === 'custom' ? themeTile('custom', L.custom, 'Custom', L.theme) : '';
  return `<div class="themes strip">${custom}${Object.entries(THEMES).map(([id, t]) => themeTile(id, t, t.name, L.theme)).join('')}</div>`;
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

export function markTemplates(container, which = 'main') {
  const sel = lookOf(which).template;
  container.querySelectorAll('.tpl').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.tpl === sel)));
}

export function markThemes(container, which = 'main') {
  const sel = lookOf(which).theme;
  container.querySelectorAll('.theme-tile').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.theme === sel)));
}

/**
 * The simple looks panel (templates, "More looks", Home clock, theme) inside `box`.
 * Handles its own taps; `onMore` opens the Customize page and `onHome` Home's.
 * The Home clock card shows while Home matches the timers, or when editing the timers' look.
 * Returns { render, destroy }.
 */
export function looksPanel(box, { which = 'main', onMore, onHome, onApply } = {}) {
  let cleanup = null;
  function render() {
    cleanup?.();
    const homeCard = onHome && (which === 'main' || !data.settings.homeLook) ? homeLookHtml() : '';
    box.innerHTML = `${templatesHtml(featuredTemplates(which), 'featured', which)}${moreLooksHtml()}${homeCard}
      <h3 class="looks-label">Theme</h3>${themesHtml(which)}`;
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
      applyTemplate(tpl.dataset.tpl, which);
      markTemplates(box, which);
      markThemes(box, which);
      onApply?.(tpl.querySelector('.tpl-name').textContent);
      return;
    }
    const th = e.target.closest('[data-theme]');
    if (th) {
      haptic(6);
      setLook({ theme: th.dataset.theme }, which);
      markTemplates(box, which);
      markThemes(box, which);
      return;
    }
    if (e.target.closest('[data-more]')) return onMore?.();
    if (e.target.closest('[data-home-look]')) onHome?.();
  });
  render();
  return { render, destroy: () => cleanup?.() };
}

/** Quick picker from a palette button. On Home with its own look, it edits Home's. */
export function openLooks({ which = 'main', onMore, onHome } = {}) {
  let panel = null;
  const home = which === 'home' && !!data.settings.homeLook;
  const pop = pushScope(which);
  const sh = sheet({
    title: home ? 'Home clock' : 'Looks',
    cls: 'looks-sheet',
    body: '<div class="looks-panel"></div>',
    onClose: () => {
      panel?.destroy();
      pop();
    },
  });
  const go = (fn) => () => {
    sh.close();
    setTimeout(() => fn?.(), 340);
  };
  panel = looksPanel(sh.body.querySelector('.looks-panel'), {
    which,
    onApply: (name) => toast(home ? `${name} applied to Home` : `${name} applied`, { ms: 1800 }),
    onMore: go(onMore),
    onHome: go(onHome),
  });
}

/**
 * A live clock showing a look, kept sized to its box. For 'home' it shows the time of day,
 * as Home does; otherwise the timers' clock. Returns a cleanup function.
 */
export function mountPreview(el, { which = 'main' } = {}) {
  let face = null;
  const ctx = { settings: () => lookOf(which) };
  const size = () => {
    const W = Math.min(el.parentElement.clientWidth, 420);
    const round = face && ['ring', 'analog'].includes(face.type);
    el.style.width = `${W}px`;
    el.style.height = `${Math.round(W * (round ? 0.62 : 0.44))}px`;
    face?.fit({ W, H: el.clientHeight, row: true, stretch: false });
  };
  const draw = (animate) => {
    if (face?.type !== lookOf(which).face) {
      face = makeFace(el, lookOf(which).face, ctx);
      draw(false);
      size();
      return;
    }
    el.classList.toggle('home-look', which === 'home');
    if (which === 'home') {
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
