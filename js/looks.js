// Templates: complete one-tap looks (style + theme + font + options), each shown as a
// live preview in its own colours.
import { data, saveSoon, emit } from './store.js';
import { TEMPLATES, THEMES, LOOK_DEFAULTS, templateLook, fontById } from './config.js';
import { makeFace } from './faces.js';
import { sheet, icon, haptic, toast } from './ui.js';
import { esc } from './util.js';

const SAMPLE = { date: new Date(2020, 0, 1, 10, 9, 34), ms: 12 * 60000 + 34000 };

export function applyTemplate(id) {
  const t = TEMPLATES.find((x) => x.id === id);
  if (!t) return;
  Object.assign(data.settings, LOOK_DEFAULTS, t.look, { template: id });
  saveSoon();
  emit('settings');
}

/** Buttons for every template; call drawTemplates(container) once they're in the page. */
export function templatesHtml() {
  return `<div class="tpls">${TEMPLATES.map((t) => {
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
    ]
      .filter(Boolean)
      .join(';');
    const cls = ['tpl', 'themed', look.shade ? 'card-shade' : '', `bd-${look.backdrop}`].join(' ');
    return `<button class="${cls}" data-tpl="${t.id}" aria-pressed="${data.settings.template === t.id}" style="${esc(vars)}">
        <span class="clock tpl-mini"></span><span class="tpl-name">${esc(t.name)}</span></button>`;
  }).join('')}</div>`;
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

/** Quick picker from the clock screen. */
export function openLooks({ onCustomize } = {}) {
  let cleanup = null;
  const sh = sheet({
    title: 'Looks',
    cls: 'looks-sheet',
    body: `${templatesHtml()}
      <button class="btn block ghost" data-customize>${icon('settings')}<span>Customize further</span></button>`,
    onClose: () => cleanup?.(),
  });
  cleanup = drawTemplates(sh.body);
  sh.body.addEventListener('click', (e) => {
    const tpl = e.target.closest('[data-tpl]');
    if (tpl) {
      haptic(8);
      applyTemplate(tpl.dataset.tpl);
      markTemplates(sh.body);
      toast(`${tpl.querySelector('.tpl-name').textContent} applied`, { ms: 1800 });
      return;
    }
    if (e.target.closest('[data-customize]')) {
      sh.close();
      setTimeout(() => onCustomize?.(), 340);
    }
  });
}
