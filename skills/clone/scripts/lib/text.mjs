// @ts-check

/** Collapse every run of whitespace to one space. @param {string} s */
export function squash(s) {
  return String(s ?? '').replace(/\s+/g, ' ').trim();
}

/**
 * Text as it should compare: typographic quotes, dashes and ellipses folded to
 * plain ones, so a quote pasted from a page still matches the row it came from.
 * @param {string} s
 */
export function fold(s) {
  return squash(
    String(s ?? '')
      .normalize('NFKC')
      .replace(/[‘’‚‛′]/g, "'")
      .replace(/[“”„‟″]/g, '"')
      .replace(/[‐-―−]/g, '-')
      .replace(/…/g, '...')
      .replace(/ /g, ' '),
  );
}

/** Lowercase words, letters and digits only, in any script. @param {string} s */
export function words(s) {
  return fold(s)
    .toLowerCase()
    .split(/[^\p{L}\p{N}']+/u)
    .map((w) => w.replace(/^'+|'+$/g, ''))
    .filter(Boolean);
}

/**
 * The words inside an identifier or a file name: `CalendlyEmbed`,
 * `calendly-embed` and `calendly_embed` all read as ["calendly", "embed"].
 * @param {string} s
 */
export function identWords(s) {
  return String(s ?? '')
    .replace(/([a-z\d])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/([A-Za-z])(\d)/g, '$1 $2')
    .replace(/(\d)([A-Za-z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

/**
 * True when `needle` appears as a contiguous run inside `hay`.
 * @param {string[]} hay @param {string[]} needle
 */
export function containsRun(hay, needle) {
  if (!needle.length || needle.length > hay.length) return false;
  outer: for (let i = 0; i <= hay.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) if (hay[i + j] !== needle[j]) continue outer;
    return true;
  }
  return false;
}

/** Sentences, split on end punctuation and line breaks. @param {string} s */
export function sentences(s) {
  return String(s ?? '')
    .split(/(?<=[.!?])\s+|\n+/)
    .map(squash)
    .filter(Boolean);
}

/**
 * Word n-grams. Overlap in these is how copied sentences are found even after
 * a word or two was changed.
 * @param {string[]} w @param {number} n
 */
export function shingles(w, n) {
  /** @type {string[]} */
  const out = [];
  for (let i = 0; i + n <= w.length; i++) out.push(w.slice(i, i + n).join(' '));
  return out;
}

/** A file-safe slug. @param {string} s @param {number} [max] */
export function slug(s, max = 60) {
  return (
    fold(s)
      .toLowerCase()
      .replace(/^https?:\/\//, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, max)
      .replace(/-+$/g, '') || 'page'
  );
}

/**
 * Characters as a person counts them, so an emoji is 1, which is how the app
 * stores count a listing's limits.
 * @param {string} s
 */
export function graphemes(s) {
  const seg = new Intl.Segmenter('en', { granularity: 'grapheme' });
  let n = 0;
  for (const _ of seg.segment(String(s ?? ''))) n++;
  return n;
}

/** @param {string} s */
export function hasEmoji(s) {
  return /\p{Extended_Pictographic}/u.test(String(s ?? ''));
}

/**
 * Levenshtein similarity in 0..1, for names that should not sound alike.
 * @param {string} a @param {string} b
 */
export function similarity(a, b) {
  const x = a.toLowerCase();
  const y = b.toLowerCase();
  if (!x.length && !y.length) return 1;
  const d = Array.from({ length: x.length + 1 }, (_, i) => [i, ...Array(y.length).fill(0)]);
  for (let j = 1; j <= y.length; j++) d[0][j] = j;
  for (let i = 1; i <= x.length; i++)
    for (let j = 1; j <= y.length; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (x[i - 1] === y[j - 1] ? 0 : 1));
  return 1 - d[x.length][y.length] / Math.max(x.length, y.length);
}
