// @ts-check
import crypto from 'node:crypto';

/**
 * An SVG path's drawing, independent of how it was written: commands and
 * numbers only, numbers rounded to one decimal. "M10,20L30,40" and
 * "M 10 20 L 30 40" draw the same shape and get the same key, so a pasted
 * icon is recognized even after a formatter or a minifier touched it.
 * @param {string} d
 */
export function pathKey(d) {
  const tokens = String(d ?? '').match(/[a-zA-Z]|-?(?:\d+\.?\d*|\.\d+)(?:e-?\d+)?/g) ?? [];
  return tokens.map((t) => (/[a-zA-Z]/.test(t) ? t : String(Math.round(Number(t) * 10) / 10))).join(' ');
}

/** A short fingerprint of a path's drawing. @param {string} d */
export function pathHash(d) {
  return crypto.createHash('sha1').update(pathKey(d)).digest('hex').slice(0, 16);
}

/**
 * The path data written in a file: `d="..."` in SVG and HTML, and the JSX
 * forms `d={"..."}` and `d={'...'}`. Short paths are left out: a straight
 * line or a plus sign is not anyone's icon.
 * @param {string} src
 * @returns {{ d: string, line: number }[]}
 */
export function pathsInText(src) {
  const out = [];
  const lines = String(src ?? '').split('\n');
  for (let i = 0; i < lines.length; i++) {
    for (const m of lines[i].matchAll(/\bd\s*=\s*(?:"([^"]{80,})"|'([^']{80,})'|\{\s*["'`]([^"'`]{80,})["'`]\s*\})/g)) {
      out.push({ d: m[1] ?? m[2] ?? m[3] ?? '', line: i + 1 });
    }
  }
  return out;
}
