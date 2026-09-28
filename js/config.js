export const APP_VERSION = '1.4.0';

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
