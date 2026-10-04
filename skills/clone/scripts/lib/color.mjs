// @ts-check

/** @typedef {{ r: number, g: number, b: number, a: number }} RGBA  r, g, b in 0..255, a in 0..1 */

const clamp = (/** @type {number} */ v, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));

/**
 * One CSS number, percent or angle as a plain number. `pctScale` says what
 * 100% means for this channel, which differs per color function.
 * @param {string} token
 * @param {number} pctScale
 */
function numberOf(token, pctScale) {
  const t = token.trim().toLowerCase();
  if (t === 'none') return 0;
  if (t.endsWith('%')) return (parseFloat(t) / 100) * pctScale;
  if (t.endsWith('deg')) return parseFloat(t);
  if (t.endsWith('turn')) return parseFloat(t) * 360;
  if (t.endsWith('grad')) return parseFloat(t) * 0.9;
  if (t.endsWith('rad')) return (parseFloat(t) * 180) / Math.PI;
  return parseFloat(t);
}

/**
 * The arguments of a color function, in either the comma or the space syntax,
 * with the optional `/ alpha`.
 * @param {string} inner
 */
function channels(inner) {
  const [main, alpha] = inner.split('/');
  const parts = main.includes(',') ? main.split(',') : main.trim().split(/\s+/);
  const list = parts.map((p) => p.trim()).filter(Boolean);
  if (alpha !== undefined) list.push(alpha.trim());
  return list;
}

const NAMED = /** @type {Record<string, string>} */ ({
  black: '#000000', white: '#ffffff', red: '#ff0000', green: '#008000', blue: '#0000ff', gray: '#808080',
  grey: '#808080', silver: '#c0c0c0', navy: '#000080', teal: '#008080', purple: '#800080', orange: '#ffa500',
  yellow: '#ffff00', transparent: '#00000000',
});

/**
 * Parse a CSS color into sRGB. Handles hex, rgb(), hsl(), oklch() and oklab(),
 * which covers what people write in tokens and what Tailwind v4 emits.
 * @param {string} input
 * @returns {RGBA | null}
 */
export function parseColor(input) {
  if (!input) return null;
  let s = String(input).trim().toLowerCase();
  if (NAMED[s]) s = NAMED[s];
  if (s.startsWith('#')) {
    const h = s.slice(1);
    if (!/^[0-9a-f]+$/.test(h)) return null;
    const full = h.length === 3 || h.length === 4 ? [...h].map((c) => c + c).join('') : h;
    if (full.length !== 6 && full.length !== 8) return null;
    const v = (/** @type {number} */ i) => parseInt(full.slice(i, i + 2), 16);
    return { r: v(0), g: v(2), b: v(4), a: full.length === 8 ? v(6) / 255 : 1 };
  }
  const m = s.match(/^([a-z]+)\((.*)\)$/);
  if (!m) return null;
  const fn = m[1];
  const ch = channels(m[2]);
  if (ch.length < 3) return null;
  const alpha = ch[3] !== undefined ? clamp(numberOf(ch[3], 1)) : 1;
  if (fn === 'rgb' || fn === 'rgba') {
    const c = ch.slice(0, 3).map((t) => clamp(numberOf(t, 255), 0, 255));
    return { r: Math.round(c[0]), g: Math.round(c[1]), b: Math.round(c[2]), a: alpha };
  }
  if (fn === 'hsl' || fn === 'hsla') {
    const h = ((numberOf(ch[0], 360) % 360) + 360) % 360;
    const sat = clamp(numberOf(ch[1], 1));
    const l = clamp(numberOf(ch[2], 1));
    const k = (/** @type {number} */ n) => (n + h / 30) % 12;
    const f = (/** @type {number} */ n) => l - sat * Math.min(l, 1 - l) * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
    return { r: Math.round(f(0) * 255), g: Math.round(f(8) * 255), b: Math.round(f(4) * 255), a: alpha };
  }
  if (fn === 'oklab') {
    return fromOklab(numberOf(ch[0], 1), numberOf(ch[1], 0.4), numberOf(ch[2], 0.4), alpha);
  }
  if (fn === 'oklch') {
    const L = numberOf(ch[0], 1);
    const C = numberOf(ch[1], 0.4);
    const H = (numberOf(ch[2], 360) * Math.PI) / 180;
    return fromOklab(L, C * Math.cos(H), C * Math.sin(H), alpha);
  }
  return null;
}

/** @param {number} c 0..255 */
const toLinear = (c) => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};
/** @param {number} v linear 0..1 */
const fromLinear = (v) => {
  const c = v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055;
  return Math.round(clamp(c) * 255);
};

/**
 * OKLab, the space where equal steps look equal. Used for every color
 * distance, so "too close to the original's blue" means what an eye sees.
 * @param {RGBA} c
 */
export function toOklab(c) {
  const r = toLinear(c.r);
  const g = toLinear(c.g);
  const b = toLinear(c.b);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return {
    L: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  };
}

/**
 * @param {number} L @param {number} A @param {number} B @param {number} alpha
 * @returns {RGBA}
 */
function fromOklab(L, A, B, alpha) {
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  return {
    r: fromLinear(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    g: fromLinear(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    b: fromLinear(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
    a: alpha,
  };
}

/** Chroma in OKLab: 0 is gray, 0.1 and up is clearly colored. @param {RGBA} c */
export function chroma(c) {
  const { a, b } = toOklab(c);
  return Math.hypot(a, b);
}

/** Hue angle in degrees. @param {RGBA} c */
export function hue(c) {
  const { a, b } = toOklab(c);
  return ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360;
}

/**
 * Distance between two colors in OKLab, scaled by 100. Around 2 is the
 * smallest difference most people notice; under 10 reads as "the same color".
 * @param {RGBA} x @param {RGBA} y
 */
export function deltaE(x, y) {
  const p = toOklab(x);
  const q = toOklab(y);
  return Math.hypot(p.L - q.L, p.a - q.a, p.b - q.b) * 100;
}

/** @param {RGBA} c */
export function hex(c) {
  const h = (/** @type {number} */ n) => Math.round(n).toString(16).padStart(2, '0');
  return `#${h(c.r)}${h(c.g)}${h(c.b)}${c.a < 1 ? h(c.a * 255) : ''}`;
}

/**
 * A translucent color as it renders over a solid one.
 * @param {RGBA} fg @param {RGBA} bg
 * @returns {RGBA}
 */
export function over(fg, bg) {
  const a = fg.a;
  return { r: fg.r * a + bg.r * (1 - a), g: fg.g * a + bg.g * (1 - a), b: fg.b * a + bg.b * (1 - a), a: 1 };
}

/** WCAG relative luminance. @param {RGBA} c */
export function luminance(c) {
  return 0.2126 * toLinear(c.r) + 0.7152 * toLinear(c.g) + 0.0722 * toLinear(c.b);
}

/**
 * WCAG 2.2 contrast ratio, never rounded: 4.499 fails AA.
 * @param {RGBA} fg @param {RGBA} bg
 */
export function contrast(fg, bg) {
  const solidBg = bg.a < 1 ? over(bg, { r: 255, g: 255, b: 255, a: 1 }) : bg;
  const solidFg = fg.a < 1 ? over(fg, solidBg) : fg;
  const l1 = luminance(solidFg);
  const l2 = luminance(solidBg);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

/** The WCAG minimum for a use: body text, large text, or a control's edge. */
export const MIN_CONTRAST = /** @type {const} */ ({ text: 4.5, large: 3, ui: 3 });

/**
 * Every color written in a chunk of source: hex, rgb(), hsl(), oklch(), oklab().
 * @param {string} text
 * @returns {{ raw: string, index: number }[]}
 */
export function colorsInText(text) {
  const out = [];
  const re = /#[0-9a-fA-F]{8}\b|#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3,4}\b|\b(?:rgba?|hsla?|oklch|oklab)\([^)]{3,80}\)/g;
  let m;
  while ((m = re.exec(text))) out.push({ raw: m[0], index: m.index });
  return out;
}
