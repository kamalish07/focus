export const APP_VERSION = '1.10.1';

/** Colour themes. `bg` = page, `card` = flip cards, `digit` = numbers, `accent` = highlights. */
export const THEMES = {
  classic:  { name: 'Classic',  bg: '#000000', card: '#121212', digit: '#b3b3b3', accent: '#d4e157' },
  graphite: { name: 'Graphite', bg: '#1b1b1d', card: '#2a2a2e', digit: '#e8e8ec', accent: '#6ea8fe' },
  midnight: { name: 'Midnight', bg: '#060a17', card: '#111a33', digit: '#a7b6ff', accent: '#7c9cff' },
  amber:    { name: 'Amber',    bg: '#0b0803', card: '#1b1407', digit: '#ffb23e', accent: '#ffb23e' },
  forest:   { name: 'Forest',   bg: '#06100b', card: '#0f2019', digit: '#a3dcb6', accent: '#4ade80' },
  ocean:    { name: 'Ocean',    bg: '#02141a', card: '#08262e', digit: '#7fe0de', accent: '#2dd4bf' },
  rose:     { name: 'Rose',     bg: '#13070b', card: '#24121a', digit: '#f4b0c6', accent: '#fb7185' },
  crimson:  { name: 'Crimson',  bg: '#0d0000', card: '#1c0505', digit: '#ff5a4f', accent: '#ff5a4f' },
  paper:    { name: 'Paper',    bg: '#ebe7df', card: '#fbfaf6', digit: '#25231f', accent: '#e4572e' },
  mist:     { name: 'Mist',     bg: '#dfe5ec', card: '#f5f8fb', digit: '#1f2a37', accent: '#3b82f6' },
};

export const themeColors = (s) => (s.theme === 'custom' ? s.custom : THEMES[s.theme] || THEMES.classic);

/** Digit fonts (loaded from Google Fonts in index.html). `ls` = letter spacing in em. */
export const FONTS = [
  { id: 'barlow',   name: 'Classic',   family: "'Barlow Semi Condensed', system-ui, sans-serif", weight: 700, ls: -0.01 },
  { id: 'bebas',    name: 'Poster',    family: "'Bebas Neue', Impact, sans-serif", weight: 400, ls: 0.02 },
  { id: 'oswald',   name: 'Narrow',    family: "'Oswald', 'Arial Narrow', sans-serif", weight: 600, ls: 0 },
  { id: 'rubik',    name: 'Round',     family: "'Rubik', system-ui, sans-serif", weight: 600, ls: -0.02 },
  { id: 'fredoka',  name: 'Soft',      family: "'Fredoka', system-ui, sans-serif", weight: 600, ls: 0 },
  { id: 'mono',     name: 'Mono',      family: "'JetBrains Mono', ui-monospace, monospace", weight: 700, ls: -0.04 },
  { id: 'orbitron', name: 'Sci-fi',    family: "'Orbitron', system-ui, sans-serif", weight: 700, ls: 0 },
  { id: 'pixel',    name: 'Pixel',     family: "'VT323', ui-monospace, monospace", weight: 400, ls: 0 },
  { id: 'serif',    name: 'Serif',     family: "'DM Serif Display', Georgia, serif", weight: 400, ls: 0 },
  { id: 'system',   name: 'System',    family: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif", weight: 700, ls: -0.02 },
];

export const fontById = (id) => FONTS.find((f) => f.id === id) || FONTS[0];

/** Category colours: the signature lime, then a colour-blind-checked categorical order. */
export const PALETTE = ['#d4e157', '#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#9085e9', '#e66767', '#008300', '#8e8e93'];

export const SOUNDS = [
  ['chime', 'Chime'],
  ['bell', 'Bell'],
  ['marimba', 'Marimba'],
  ['digital', 'Digital'],
  ['none', 'Silent'],
];

export const TIMER_PRESETS = [5, 10, 15, 20, 25, 30, 45, 60, 90, 120];

/** Every setting that belongs to "the look". A template resets all of these, then applies its own. */
export const LOOK_DEFAULTS = {
  theme: 'classic',
  face: 'flip',
  font: 'barlow',
  faceColor: 'auto', // or a hex colour; "auto" = each style's own colour
  glow: 0.6,
  ghost: true, // show unlit LED segments / dots / nixie cathodes
  ticks: true, // tick marks on Ring and Analog
  blink: true, // blinking colon
  flipSpeed: 'normal',
  shade: false, // card depth shading on Flip
  backdrop: 'none', // none | glow | gradient
  aurora: 'ocean',
  digitScale: 1,
  radius: 0.09,
  hinge: true,
  flip: true,
};
export const LOOK_KEYS = new Set([...Object.keys(LOOK_DEFAULTS), 'custom']);

export const FACE_COLORS = [
  ['auto', 'Auto'],
  ['#d4e157', 'Lime'],
  ['#ff5a4f', 'Red'],
  ['#ff9a3c', 'Orange'],
  ['#ffd166', 'Yellow'],
  ['#4ade80', 'Green'],
  ['#22d3ee', 'Cyan'],
  ['#60a5fa', 'Blue'],
  ['#a78bfa', 'Violet'],
  ['#f472b6', 'Pink'],
  ['#f5f5f5', 'White'],
];

export const AURORAS = [
  ['ocean', 'Ocean'],
  ['sunset', 'Sunset'],
  ['forest', 'Forest'],
  ['berry', 'Berry'],
];

/** One-tap looks. Anything not listed falls back to LOOK_DEFAULTS. */
export const TEMPLATES = [
  { id: 'classic', name: 'Classic Flip', look: {} },
  { id: 'paper', name: 'Paper Flip', look: { theme: 'paper', shade: true } },
  { id: 'nixie', name: 'Retro Nixie', look: { theme: 'amber', face: 'nixie', backdrop: 'glow' } },
  { id: 'neon', name: 'Neon Night', look: { theme: 'midnight', face: 'neon', font: 'fredoka', faceColor: '#f472b6', glow: 0.8, backdrop: 'glow' } },
  { id: 'aurora', name: 'Aurora', look: { theme: 'midnight', face: 'aurora', font: 'rubik', aurora: 'ocean', backdrop: 'gradient' } },
  { id: 'bedside', name: 'Bedside LED', look: { theme: 'crimson', face: 'led', faceColor: '#ff5a4f', glow: 0.8 } },
  { id: 'arcade', name: 'Arcade', look: { theme: 'ocean', face: 'dots', faceColor: '#22d3ee', glow: 0.8, backdrop: 'glow' } },
  { id: 'zen', name: 'Zen Ring', look: { theme: 'mist', face: 'ring', font: 'rubik' } },
  { id: 'watch', name: 'Wristwatch', look: { theme: 'paper', face: 'analog', font: 'serif' } },
  { id: 'nightwatch', name: 'Night Watch', look: { theme: 'graphite', face: 'analog', faceColor: '#ff9a3c' } },
  { id: 'mint', name: 'Mint LED', look: { theme: 'forest', face: 'led', faceColor: '#4ade80' } },
  { id: 'sunset', name: 'Sunset', look: { theme: 'rose', face: 'aurora', font: 'fredoka', aurora: 'sunset', backdrop: 'glow' } },
  { id: 'mono', name: 'Mono', look: { theme: 'graphite', face: 'minimal', font: 'mono' } },
  { id: 'terminal', name: 'Terminal', look: { theme: 'forest', face: 'minimal', font: 'pixel' } },
  { id: 'poster', name: 'Poster', look: { theme: 'classic', face: 'minimal', font: 'bebas' } },
  { id: 'ice', name: 'Ice Nixie', look: { theme: 'ocean', face: 'nixie', faceColor: '#60a5fa', backdrop: 'glow' } },
];

export const templateLook = (t) => ({ ...LOOK_DEFAULTS, ...t.look });
