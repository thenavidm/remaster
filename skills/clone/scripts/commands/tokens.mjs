// @ts-check
import path from 'node:path';
import { chroma, contrast, deltaE, hex, over, parseColor } from '../lib/color.mjs';
import { measurements, paths, projectRoot, readJson, rel, writeJson, writeText } from '../lib/fsx.mjs';
import { fail, mdTable, say } from '../lib/out.mjs';

export const help = `remaster tokens [measure.json ...] [--out remaster/design/measured.json]

Summarize measurements of the original into its design system: color roles,
type scale, spacing base, corners, shadows, motion and layout widths. With no
files it reads every measurement in remaster/research/measure at the widest
width. Writes measured.json and a readable measured.md.

This is the original's system, kept as reference. Its scale and rhythm are
yours to reuse; its identity (palette, typeface, brand color) is not, and
the brand colors it finds are the ones the sweep will hold you away from.`;

/** @typedef {{ hex: string, text: number, bg: number, border: number, icon: number, action: number, label: number }} ColorUse */

/**
 * Merge colors closer than a just-noticeable difference, keeping the more
 * used one's hex. Anti-aliasing and opacity steps otherwise split one brand
 * color into five.
 * @param {ColorUse[]} list
 */
export function clusterColors(list) {
  /** @type {ColorUse[]} */
  const out = [];
  const weight = (/** @type {ColorUse} */ c) => c.text + c.bg + c.border * 10 + c.icon * 5 + c.action * 40 + c.label * 10;
  for (const c of [...list].sort((a, b) => weight(b) - weight(a))) {
    const rgba = parseColor(c.hex);
    if (!rgba) continue;
    const near = out.find((o) => {
      const other = parseColor(o.hex);
      return other && Math.abs(other.a - rgba.a) < 0.15 && deltaE(other, rgba) < 2.5;
    });
    if (near) {
      near.text += c.text;
      near.bg += c.bg;
      near.border += c.border;
      near.icon += c.icon;
      near.action += c.action;
      near.label += c.label;
    } else out.push({ ...c });
  }
  return out;
}

/**
 * The roles a design system's colors play, read from how each color is used.
 * @param {ColorUse[]} colors already clustered
 * @param {string} canvasHex
 */
export function colorRoles(colors, canvasHex) {
  const canvas = parseColor(canvasHex) ?? { r: 255, g: 255, b: 255, a: 1 };
  const rgb = (/** @type {ColorUse} */ c) => /** @type {import('../lib/color.mjs').RGBA} */ (parseColor(c.hex));
  const solid = colors.filter((c) => (parseColor(c.hex)?.a ?? 0) >= 0.95);
  const totalText = solid.reduce((s, c) => s + c.text, 0) || 1;
  // Ink is the main text color: of the colors that carry real amounts of
  // text, the most used one that reads as primary text (7:1 or better),
  // else the strongest. Gray body copy can outnumber dark headings, and is
  // still not the ink.
  const textual = solid.filter((c) => c.text >= totalText * 0.08).sort((a, b) => b.text - a.text);
  const strong = textual.filter((c) => contrast(rgb(c), canvas) >= 7);
  const ink = strong[0] ?? [...textual].sort((a, b) => contrast(rgb(b), canvas) - contrast(rgb(a), canvas))[0] ?? solid.filter((c) => c.text > 0).sort((a, b) => b.text - a.text)[0];
  const inkSoft = ink
    ? textual.find((c) => {
        if (c === ink || deltaE(rgb(c), rgb(ink)) < 5) return false;
        const k = contrast(rgb(c), canvas);
        return k >= 3 && k < contrast(rgb(ink), canvas);
      })
    : undefined;
  const surface = [...solid]
    .filter((c) => c.bg > 0 && deltaE(rgb(c), canvas) >= 2)
    .sort((a, b) => b.bg - a.bg)[0];
  // The accent is what the buttons are filled with. Only when no button has
  // a fill does a colored link stand in for it.
  const filled = [...solid].filter((c) => c.action > 0 && deltaE(rgb(c), canvas) >= 10).sort((a, b) => b.action - a.action);
  const chromaticLabels = solid.filter((c) => c.label > 0 && chroma(rgb(c)) >= 0.06).sort((a, b) => b.label - a.label);
  // A colored fill is the primary call to action even when neutral secondary
  // buttons outnumber it, as long as it is used more than once or twice.
  const coloredFill = filled.find((c) => chroma(rgb(c)) >= 0.06 && c.action >= Math.max(2, (filled[0]?.action ?? 0) * 0.15));
  const accent = coloredFill ?? filled[0] ?? chromaticLabels[0];
  let onAccent = null;
  if (accent) {
    const white = { r: 255, g: 255, b: 255, a: 1 };
    const dark = ink && contrast(rgb(ink), white) > 1.5 ? rgb(ink) : { r: 17, g: 17, b: 17, a: 1 };
    onAccent = contrast(white, rgb(accent)) >= contrast(dark, rgb(accent)) ? '#ffffff' : ink?.hex ?? '#111111';
  }
  const border = [...colors].filter((c) => c.border > 0).sort((a, b) => b.border - a.border)[0];
  // Brand colors are the colored ones the product itself uses for fills,
  // text and controls. A color that only appears inside icons is usually a
  // third party's logo (a sign-in button, a review badge), not the brand.
  const others = solid
    .filter((c) => c !== accent && chroma(rgb(c)) >= 0.06 && c.action + c.label + c.text + c.bg > 0)
    .sort((a, b) => b.action * 40 + b.label * 10 + b.bg + b.text - (a.action * 40 + a.label * 10 + a.bg + a.text));
  // The accent is a brand color unless it is a true gray: a dark navy button
  // is as much the original's identity as a bright one.
  const brand = [...(accent && chroma(rgb(accent)) >= 0.03 ? [accent] : []), ...others].slice(0, 6).map((c) => c.hex);
  return {
    canvas: canvasHex,
    surface: surface?.hex ?? null,
    ink: ink?.hex ?? null,
    inkSoft: inkSoft?.hex ?? null,
    accent: accent?.hex ?? null,
    onAccent,
    border: border?.hex ?? null,
    brand,
  };
}

/**
 * The spacing base: the largest of 8, 4 and 2 that most measured gaps are a
 * multiple of.
 * @param {{ value: number, count: number }[]} values
 */
export function spacingBase(values) {
  const meaningful = values.filter((v) => v.value >= 4);
  const total = meaningful.reduce((s, v) => s + v.count, 0) || 1;
  for (const base of [8, 4, 2]) {
    const share = meaningful.filter((v) => v.value % base === 0).reduce((s, v) => s + v.count, 0) / total;
    if (share >= 0.7) return { base, share };
  }
  return { base: 1, share: 1 };
}

/** @param {any[]} items @param {(x: any) => string} key */
function mergeCounts(items, key) {
  /** @type {Map<string, number>} */
  const m = new Map();
  for (const it of items) m.set(key(it), (m.get(key(it)) ?? 0) + it.count);
  return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([value, count]) => ({ value, count }));
}

/**
 * The whole summary from a set of measurements.
 * @param {any[]} pages measure.json objects
 */
export function summarize(pages) {
  /** @type {Map<string, ColorUse>} */
  const colorMap = new Map();
  for (const p of pages)
    for (const c of p.colors ?? []) {
      const prev = colorMap.get(c.hex);
      if (prev) {
        prev.text += c.text;
        prev.bg += c.bg;
        prev.border += c.border;
        prev.icon += c.icon;
        prev.action += c.action ?? 0;
        prev.label += c.label ?? 0;
      } else colorMap.set(c.hex, { action: 0, label: 0, ...c });
    }
  const canvasVotes = mergeCounts(pages.map((p) => ({ value: p.canvas, count: 1 })), (x) => x.value);
  const canvas = canvasVotes[0]?.value ?? '#ffffff';
  // Translucent colors become the solid color they render as on the page,
  // so rgba(0,0,0,.9) text counts as the near-black it looks like.
  const canvasRgb = parseColor(canvas) ?? { r: 255, g: 255, b: 255, a: 1 };
  const solidified = [...colorMap.values()].map((c) => {
    const x = parseColor(c.hex);
    return x && x.a < 1 ? { ...c, hex: hex(over(x, canvasRgb)) } : c;
  });
  const colors = clusterColors(solidified);
  const roles = colorRoles(colors, canvas);

  /** @type {Map<number, { size: number, chars: number, lineHeights: Map<string, number>, weights: Map<string, number>, families: Map<string, number>, tags: Record<string, number> }>} */
  const sizes = new Map();
  for (const p of pages)
    for (const t of p.type ?? []) {
      const size = Math.round(parseFloat(t.size));
      if (!sizes.has(size)) sizes.set(size, { size, chars: 0, lineHeights: new Map(), weights: new Map(), families: new Map(), tags: {} });
      const s = /** @type {any} */ (sizes.get(size));
      s.chars += t.chars;
      s.lineHeights.set(t.lineHeight, (s.lineHeights.get(t.lineHeight) ?? 0) + t.chars);
      s.weights.set(t.weight, (s.weights.get(t.weight) ?? 0) + t.chars);
      s.families.set(t.family, (s.families.get(t.family) ?? 0) + t.chars);
      for (const [k, v] of Object.entries(t.tags ?? {})) s.tags[k] = (s.tags[k] ?? 0) + Number(v);
    }
  const top = (/** @type {Map<string, number>} */ m) => [...m.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
  const totalChars = [...sizes.values()].reduce((s, x) => s + x.chars, 0) || 1;
  const typeScale = [...sizes.values()]
    .filter((s) => s.chars / totalChars >= 0.004)
    .sort((a, b) => a.size - b.size)
    .map((s) => ({
      size: `${s.size}px`,
      lineHeight: top(s.lineHeights),
      weight: top(s.weights),
      family: top(s.families),
      share: Math.round((s.chars / totalChars) * 1000) / 10,
      usedFor: Object.entries(s.tags).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k]) => k),
    }));
  const bodySize = [...sizes.values()].sort((a, b) => b.chars - a.chars)[0]?.size ?? 16;
  const steps = typeScale.map((t) => parseFloat(t.size)).filter((v) => v >= bodySize);
  const ratios = steps.slice(1).map((v, i) => v / steps[i]);
  const ratio = ratios.length ? Math.round((ratios.reduce((a, b) => a + b, 0) / ratios.length) * 100) / 100 : null;

  /** @type {Map<string, { family: string, chars: number, weights: Record<string, number> }>} */
  const fontMap = new Map();
  for (const p of pages)
    for (const f of p.fonts ?? []) {
      const prev = fontMap.get(f.family) ?? { family: f.family, chars: 0, weights: {} };
      prev.chars += f.chars;
      for (const [w, n] of Object.entries(f.weights ?? {})) prev.weights[w] = (prev.weights[w] ?? 0) + Number(n);
      fontMap.set(f.family, prev);
    }
  const fontTotal = [...fontMap.values()].reduce((s, f) => s + f.chars, 0) || 1;
  const fonts = [...fontMap.values()]
    .sort((a, b) => b.chars - a.chars)
    .map((f) => ({ family: f.family, share: Math.round((f.chars / fontTotal) * 1000) / 10, weights: Object.keys(f.weights).sort() }));

  const spacing = mergeCounts(pages.flatMap((p) => p.spacing ?? []), (x) => String(x.value)).map((x) => ({ value: Number(x.value), count: x.count }));
  const spaceTotal = spacing.reduce((s, v) => s + v.count, 0) || 1;
  const base = spacingBase(spacing);
  const spacingScale = spacing.filter((s) => s.count / spaceTotal >= 0.01).map((s) => s.value).sort((a, b) => a - b);

  const radius = mergeCounts(pages.flatMap((p) => p.radius ?? []), (x) => String(x.value)).slice(0, 6);
  const shadows = mergeCounts(pages.flatMap((p) => p.shadows ?? []), (x) => String(x.value)).slice(0, 4);
  const durations = mergeCounts(pages.flatMap((p) => p.motion?.durations ?? []), (x) => String(x.value)).slice(0, 4);
  const easings = mergeCounts(pages.flatMap((p) => p.motion?.easings ?? []), (x) => String(x.value)).slice(0, 3);
  const containers = mergeCounts(pages.flatMap((p) => p.containers ?? []), (x) => String(x.value)).slice(0, 4);
  const breakpoints = mergeCounts(pages.flatMap((p) => p.breakpoints?.values ?? []), (x) => String(x.value))
    .slice(0, 8)
    .map((b) => Number(b.value))
    .sort((a, b) => a - b);
  const logo = pages.find((p) => p.logo)?.logo ?? null;

  return {
    v: 1,
    pages: pages.map((p) => ({ url: p.url, width: p.viewport?.w, title: p.title })),
    colors: { ...roles, all: colors.slice(0, 24).map((c) => ({ ...c })) },
    fonts,
    type: { body: `${bodySize}px`, ratio, scale: typeScale },
    spacing: { base: base.base, baseShare: Math.round(base.share * 100), scale: spacingScale },
    radius,
    shadows,
    motion: { durations, easings, animations: pages.reduce((s, p) => s + (p.motion?.animations ?? 0), 0) },
    layout: { containers, breakpoints },
    logo,
    gradients: [...new Set(pages.flatMap((p) => p.gradients ?? []))].slice(0, 6),
    tech: pages[0]?.tech ?? {},
  };
}

/** @param {ReturnType<typeof summarize>} s */
export function toMarkdown(s) {
  const c = s.colors;
  const lines = [
    '# The original\'s design system, as measured',
    '',
    `Measured from ${s.pages.map((p) => `${p.url} at ${p.width}px`).join(', ')}.`,
    '',
    'Reference only. Reuse the scale and rhythm; replace the identity (palette, typeface, brand color, icons, imagery).',
    '',
    '## Colors',
    '',
    mdTable(['Role', 'Color'], [
      ['canvas', c.canvas], ['surface', c.surface ?? 'none'], ['ink', c.ink ?? 'none'], ['ink-soft', c.inkSoft ?? 'none'],
      ['accent', c.accent ?? 'none'], ['on-accent', c.onAccent ?? 'none'], ['border', c.border ?? 'none'],
    ]),
    '',
    `Brand colors to stay away from: ${c.brand.length ? c.brand.join(', ') : 'none chromatic found'}.`,
    '',
    '## Type',
    '',
    `Fonts: ${s.fonts.slice(0, 4).map((f) => `${f.family} (${f.share}%, weights ${f.weights.join('/')})`).join('; ')}.`,
    `Body size ${s.type.body}; average step ratio above body ${s.type.ratio ?? 'n/a'}.`,
    '',
    mdTable(['Size', 'Line height', 'Weight', 'Family', 'Share', 'Used for'], s.type.scale.map((t) => [t.size, t.lineHeight, t.weight, t.family, `${t.share}%`, t.usedFor.join(', ')])),
    '',
    '## Spacing, corners, depth, motion',
    '',
    `Spacing base ${s.spacing.base}px (${s.spacing.baseShare}% of measured gaps are multiples). Scale: ${s.spacing.scale.join(', ')}.`,
    '',
    `Corners: ${s.radius.map((r) => `${r.value} (${r.count})`).join(', ') || 'square'}.`,
    '',
    `Shadows: ${s.shadows.length ? s.shadows.map((x) => '`' + x.value + '`').join('; ') : 'none'}.`,
    '',
    `Motion: durations ${s.motion.durations.map((d) => d.value + 'ms').join(', ') || 'none in CSS'}; easings ${s.motion.easings.map((e) => e.value).join(', ') || 'none'}; ${s.motion.animations} keyframe animations.`,
    '',
    `Layout widths: ${s.layout.containers.map((x) => x.value + 'px').join(', ') || 'none found'}.`,
    '',
    `Breakpoints: ${s.layout.breakpoints.length ? s.layout.breakpoints.map((b) => b + 'px').join(', ') : 'none readable (cross-origin stylesheets)'}.`,
    '',
    s.logo ? `Logo: ${s.logo.tag}${s.logo.alt ? ` "${s.logo.alt}"` : ''}, ${s.logo.w}x${s.logo.h}${s.logo.saved ? `, saved as ${s.logo.saved} for the sweep` : ''}. Never reuse it.` : 'Logo: not found.',
    '',
    s.gradients.length ? `Gradients seen: ${s.gradients.length}.` : 'No gradients.',
    '',
  ];
  return lines.join('\n');
}

/** @param {{ flags: Record<string, string | boolean>, positionals: string[] }} args */
export async function run({ flags, positionals }) {
  const root = projectRoot();
  const p = paths(root);
  let files = positionals.length ? positionals.map((f) => path.resolve(f)) : measurements(p.measureOriginal);
  if (!files.length) fail('No measurements found. Run `remaster measure <url>` first, or pass measure JSON files.');
  if (!positionals.length) {
    const widest = Math.max(...files.map((f) => Number(f.match(/@(\d+)\.json$/)?.[1] ?? 0)));
    files = files.filter((f) => f.endsWith(`@${widest}.json`));
  }
  const pages = files.map((f) => readJson(f));
  const summary = summarize(pages);
  const out = typeof flags.out === 'string' ? path.resolve(flags.out) : p.measured;
  writeJson(out, summary);
  writeText(out.replace(/\.json$/, '.md'), toMarkdown(summary));
  if (flags.json) {
    say(JSON.stringify(summary, null, 2));
    return 0;
  }
  const c = summary.colors;
  say(`Read ${pages.length} page(s). Saved ${rel(root, out)} and ${rel(root, out.replace(/\.json$/, '.md'))}.`);
  say(`Colors: canvas ${c.canvas}, surface ${c.surface}, ink ${c.ink}, ink-soft ${c.inkSoft}, accent ${c.accent}, border ${c.border}`);
  say(`Brand colors to avoid: ${c.brand.join(', ') || 'none'}`);
  say(`Type: body ${summary.type.body}, ${summary.type.scale.length} sizes, ratio ${summary.type.ratio}; fonts ${summary.fonts.slice(0, 3).map((f) => f.family).join(', ')}`);
  say(`Spacing base ${summary.spacing.base}px; corners ${summary.radius.slice(0, 3).map((r) => r.value).join(', ')}`);
  return 0;
}
