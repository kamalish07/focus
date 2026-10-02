export const SEC = 1000;
export const MIN = 60 * SEC;
export const HOUR = 60 * MIN;

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
export const pad = (n) => String(n).padStart(2, '0');
export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

/** Split milliseconds into [h, m, s]. Countdowns round up so "25:00" stays until a full second has passed. */
export function hms(ms, roundUp = false) {
  const t = Math.max(0, roundUp ? Math.ceil(ms / SEC) : Math.floor(ms / SEC));
  return [Math.floor(t / 3600), Math.floor((t % 3600) / 60), t % 60];
}

/** Human duration: "45s", "25m", "2h", "2h 5m". */
export function fmtDur(ms) {
  ms = Math.max(0, ms || 0);
  if (ms === 0) return '0m';
  if (ms < MIN) return `${Math.floor(ms / SEC)}s`;
  const total = Math.floor(ms / MIN);
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (!h) return `${m}m`;
  return m ? `${h}h ${m}m` : `${h}h`;
}

// Intl formatters are slow to create (phones especially), so each set of options is made once.
const fmts = new Map();
export function dateFmt(opts) {
  const key = JSON.stringify(opts);
  let f = fmts.get(key);
  if (!f) fmts.set(key, (f = new Intl.DateTimeFormat([], opts)));
  return f;
}
export const fmtDate = (d, opts) => dateFmt(opts).format(d);
export const fmtTime = (ts) => dateFmt({ hour: 'numeric', minute: '2-digit' }).format(ts);

export function luminance(hex) {
  const n = parseInt(String(hex).replace('#', '').padEnd(6, '0').slice(0, 6), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}

export const getPath = (obj, path) => path.split('.').reduce((o, k) => (o == null ? o : o[k]), obj);

export function setPath(obj, path, value) {
  const keys = path.split('.');
  const last = keys.pop();
  const target = keys.reduce((o, k) => (o[k] ??= {}), obj);
  target[last] = value;
}

export function downloadFile(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
