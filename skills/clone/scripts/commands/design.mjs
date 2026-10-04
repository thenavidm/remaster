// @ts-check
import fs from 'node:fs';
import path from 'node:path';
import { MIN_CONTRAST, chroma, contrast, deltaE, hex, hue, parseColor } from '../lib/color.mjs';
import { exists, paths, projectRoot, readJson, rel, writeText } from '../lib/fsx.mjs';
import { fail, say, table } from '../lib/out.mjs';
import { toYaml } from '../lib/yaml.mjs';

export const help = `remaster design [design.json] [--measured measured.json] [--out DESIGN.md] [--force]

Check your design (remaster/design/design.json by default) and write it as a
DESIGN.md, the file coding agents read for exact colors, type, spacing and
corners, plus, in remaster/design: tokens.css (CSS variables and a Tailwind v4
theme), shadcn.css (a shadcn/ui theme) and tokens.json (W3C design tokens).

Checks: every color parses; text pairs meet WCAG AA (4.5:1, 3:1 for large
text and controls); the accent keeps its distance from the original's brand
colors; the type scale has a real hierarchy; one corner scale; component
tokens point at tokens that exist; and the AI-default traps (violet accent,
pure black, one typeface for everything).

An existing DESIGN.md that Remaster didn't write is never overwritten: the
file goes to remaster/design/DESIGN.md instead, so a host app's design stays
the host's. --force overwrites anyway.`;

const MARKER = '<!-- written by remaster design; edit remaster/design/design.json and run it again -->';

/** Role pairs checked by default: what text sits on, and what a control sits on. */
const DEFAULT_PAIRS = /** @type {[string, string, keyof typeof MIN_CONTRAST][]} */ ([
  ['ink', 'canvas', 'text'],
  ['ink-soft', 'canvas', 'text'],
  ['ink', 'surface', 'text'],
  ['ink-soft', 'surface', 'text'],
  ['on-accent', 'accent', 'text'],
  ['accent', 'canvas', 'ui'],
  ['border-input', 'canvas', 'ui'],
]);

/** Families that are free to use anywhere, so matching the original on one is not a copying problem. */
const OPEN_FONTS = new Set(['inter', 'roboto', 'open sans', 'lato', 'montserrat', 'poppins', 'source sans 3', 'ibm plex sans', 'geist', 'manrope', 'dm sans', 'work sans', 'nunito', 'raleway', 'system-ui', 'sans-serif', 'serif', 'monospace']);

/**
 * @typedef {{ level: 'error' | 'warning' | 'note', rule: string, message: string }} Finding
 */

/**
 * All the checks on a design, against the original's measured system when
 * there is one.
 * @param {any} d design.json
 * @param {any} [measured] measured.json of the original
 * @param {string[]} [avoidColors] extra colors to keep away from (brand.json)
 * @returns {Finding[]}
 */
export function lintDesign(d, measured, avoidColors = []) {
  /** @type {Finding[]} */
  const out = [];
  const add = (/** @type {Finding['level']} */ level, /** @type {string} */ rule, /** @type {string} */ message) => out.push({ level, rule, message });
  const colors = /** @type {Record<string, string>} */ (d.colors ?? {});
  if (!d.name) add('warning', 'name', 'No name. DESIGN.md readers use it to say whose system this is.');
  for (const role of ['canvas', 'ink', 'accent']) if (!colors[role]) add('error', 'roles', `No "${role}" color. Every screen needs it.`);
  for (const role of ['surface', 'ink-soft', 'on-accent', 'border']) if (!colors[role]) add('warning', 'roles', `No "${role}" color.`);
  for (const [k, v] of Object.entries({ ...colors, ...Object.fromEntries(Object.entries(d.dark ?? {}).map(([k2, v2]) => [`${k2} (dark)`, v2])) })) {
    if (!parseColor(String(v))) add('error', 'invalid-color', `"${k}" is not a color I can read: ${v}. Use hex, rgb(), hsl(), oklch() or oklab().`);
  }

  /** @param {Record<string, string>} set @param {string} label */
  const checkPairs = (set, label) => {
    const pairs = Array.isArray(d.pairs) && d.pairs.length ? d.pairs : DEFAULT_PAIRS;
    for (const [fg, bg, level = 'text'] of pairs) {
      const a = parseColor(set[fg]);
      const b = parseColor(set[bg]);
      if (!a || !b) continue;
      const k = contrast(a, b);
      const min = MIN_CONTRAST[/** @type {keyof typeof MIN_CONTRAST} */ (level)] ?? 4.5;
      if (k < min) add('error', 'contrast', `${label}${fg} on ${bg}: ${k.toFixed(2)}:1, needs ${min}:1 for ${level === 'text' ? 'body text' : level === 'large' ? 'large text' : 'a control edge'}.`);
    }
  };
  checkPairs(colors, '');
  if (d.dark) checkPairs({ ...colors, ...d.dark }, 'Dark: ');

  const theirs = [...new Set([...(measured?.colors?.brand ?? []), ...avoidColors])].map((c) => ({ raw: c, rgba: parseColor(c) })).filter((x) => x.rgba);
  const accent = parseColor(colors.accent);
  if (accent) {
    for (const t of theirs) {
      const other = /** @type {import('../lib/color.mjs').RGBA} */ (t.rgba);
      const dE = deltaE(accent, other);
      const hueGap = Math.abs(((hue(accent) - hue(other) + 540) % 360) - 180);
      const sameFamily = chroma(accent) >= 0.06 && chroma(other) >= 0.06 && hueGap < 25;
      if (dE < 10 || (dE < 20 && sameFamily))
        add('error', 'too-close', `The accent ${colors.accent} is too close to the original's ${t.raw} (distance ${dE.toFixed(1)}, hue ${Math.round(hueGap)} degrees apart). Pick a different color family: a brand color plus the same layout is the original's trade dress.`);
    }
    const h = hue(accent);
    if (chroma(accent) >= 0.1 && h >= 270 && h <= 310) add('warning', 'ai-violet', `The accent is violet (hue ${Math.round(h)}). It is the most common AI default; keep it only if the brand calls for it.`);
  }
  for (const [role, value] of Object.entries(colors)) {
    if (role === 'accent') continue;
    const c = parseColor(value);
    if (!c || chroma(c) < 0.06) continue;
    for (const t of theirs) {
      const dE = deltaE(c, /** @type {any} */ (t.rgba));
      if (dE < 8) add('warning', 'too-close', `"${role}" ${value} is ${dE.toFixed(1)} from the original's ${t.raw}.`);
    }
  }
  for (const role of ['ink', 'canvas']) {
    const c = parseColor(colors[role]);
    if (c && hex(c) === '#000000') add('warning', 'pure-black', `"${role}" is pure black. Off-black has air in it; #000 looks like a hole.`);
  }

  const typo = /** @type {Record<string, any>} */ (d.typography ?? {});
  const sizes = Object.values(typo).map((t) => parseFloat(String(t.fontSize ?? ''))).filter((n) => n > 0).sort((a, b) => a - b);
  if (sizes.length < 4) add('warning', 'type-scale', `${sizes.length} text sizes. A product needs at least 4: small, body, heading, display.`);
  if (sizes.length >= 2 && sizes[sizes.length - 1] / sizes[0] < 2) add('warning', 'type-scale', 'The largest size is under twice the smallest, so nothing reads as a headline.');
  const families = [...new Set(Object.values(typo).map((t) => String(t.fontFamily ?? '').split(',')[0].replace(/["']/g, '').trim()).filter(Boolean))];
  if (families.length > 3) add('warning', 'fonts', `${families.length} typefaces. Two is the limit: one for display, one for text.`);
  if (families.length === 1 && /^inter\b/i.test(families[0])) add('warning', 'fonts', 'Inter for everything reads as a non-decision. Give the display text its own face.');
  const theirFonts = (measured?.fonts ?? []).slice(0, 2).map((/** @type {any} */ f) => String(f.family).toLowerCase());
  for (const f of families) {
    if (theirFonts.includes(f.toLowerCase()) && !OPEN_FONTS.has(f.toLowerCase()))
      add('error', 'their-font', `"${f}" is the original's typeface. Pick your own, and check the license of any font you ship.`);
  }
  const bodyKey = Object.keys(typo).find((k) => /body|text|base|p$/i.test(k));
  if (bodyKey) {
    const b = parseFloat(String(typo[bodyKey].fontSize ?? ''));
    if (b && (b < 14 || b > 20)) add('warning', 'body-size', `Body text at ${b}px. 15 to 18px reads best on screens.`);
  }

  const radii = [...new Set(Object.values(d.rounded ?? {}).map(String).filter((r) => !/9999|50%|full/.test(r)))];
  if (radii.length > 4) add('warning', 'corners', `${radii.length} corner sizes. Pick one scale of 3 and hold it everywhere.`);

  const spacing = Object.values(d.spacing ?? {}).map((v) => parseFloat(String(v))).filter((n) => n > 0);
  if (spacing.length) {
    const base = [8, 4, 2].find((b) => spacing.filter((s) => s % b === 0).length / spacing.length >= 0.8);
    if (!base) add('warning', 'spacing', 'The spacing values share no base. Use multiples of 4 so every gap belongs to one rhythm.');
  } else add('warning', 'spacing', 'No spacing scale.');

  const tokens = new Set([
    ...Object.keys(colors).map((k) => `colors.${k}`),
    ...Object.keys(typo).map((k) => `typography.${k}`),
    ...Object.keys(d.rounded ?? {}).map((k) => `rounded.${k}`),
    ...Object.keys(d.spacing ?? {}).map((k) => `spacing.${k}`),
  ]);
  for (const [name, props] of Object.entries(d.components ?? {})) {
    for (const v of Object.values(/** @type {Record<string, string>} */ (props))) {
      for (const ref of String(v).matchAll(/\{([^}]+)\}/g)) if (!tokens.has(ref[1])) add('error', 'missing-token', `Component "${name}" points at {${ref[1]}}, which isn't defined.`);
    }
  }
  return out;
}

/**
 * The DESIGN.md text: YAML tokens in front, then the 8 sections in the
 * format's order. A section with nothing to say is left out, never moved.
 * @param {any} d
 */
export function toDesignMd(d) {
  const colors = { ...(d.colors ?? {}) };
  for (const [k, v] of Object.entries(d.dark ?? {})) colors[`${k}-dark`] = v;
  const front = {
    version: 'alpha',
    name: d.name ?? 'Untitled',
    description: d.description ?? undefined,
    colors,
    typography: d.typography ?? undefined,
    rounded: d.rounded ?? undefined,
    spacing: d.spacing ?? undefined,
    components: d.components ?? undefined,
  };
  const notes = /** @type {Record<string, string>} */ (d.notes ?? {});
  const prose = /** @type {Record<string, string>} */ (d.prose ?? {});
  const list = (/** @type {Record<string, unknown>} */ obj, /** @type {string} */ group) =>
    Object.entries(obj ?? {})
      .map(([k, v]) => `- \`${k}\` (${typeof v === 'object' ? Object.entries(/** @type {any} */ (v)).map(([a, b]) => `${a} ${b}`).join(', ') : v})${notes[`${group}.${k}`] || notes[k] ? `: ${notes[`${group}.${k}`] ?? notes[k]}` : ''}`)
      .join('\n');
  const sections = [
    ['Overview', [prose.overview, d.direction ? `Direction: ${d.direction}` : ''].filter(Boolean).join('\n\n')],
    ['Colors', [prose.colors, list(colors, 'colors')].filter(Boolean).join('\n\n')],
    ['Typography', [prose.typography, list(d.typography, 'typography')].filter(Boolean).join('\n\n')],
    ['Layout', [prose.layout, d.spacing ? list(d.spacing, 'spacing') : ''].filter(Boolean).join('\n\n')],
    ['Elevation & Depth', [prose.elevation, d.elevation ? list(d.elevation, 'elevation') : ''].filter(Boolean).join('\n\n')],
    ['Shapes', [prose.shapes, d.rounded ? list(d.rounded, 'rounded') : ''].filter(Boolean).join('\n\n')],
    ['Components', [prose.components, d.components ? list(d.components, 'components') : ''].filter(Boolean).join('\n\n')],
    [
      "Do's and Don'ts",
      [d.dos?.length ? `### Do\n\n${d.dos.map((x) => `- ${x}`).join('\n')}` : '', d.donts?.length ? `### Don't\n\n${d.donts.map((x) => `- ${x}`).join('\n')}` : ''].filter(Boolean).join('\n\n'),
    ],
  ];
  const motion = d.motion ? `## Motion\n\n${[prose.motion, list(d.motion, 'motion')].filter(Boolean).join('\n\n')}` : '';
  const body = sections.filter(([, b]) => b).map(([t, b]) => `## ${t}\n\n${b}`).join('\n\n');
  return `---\n${toYaml(front)}\n---\n\n${MARKER}\n\n# ${d.name ?? 'Design'}\n\n${d.description ?? ''}\n\n${body}${motion ? `\n\n${motion}` : ''}\n`;
}

/**
 * CSS custom properties for the code, plus a Tailwind v4 @theme block that
 * browsers ignore and Tailwind turns into utilities like bg-canvas.
 * @param {any} d
 */
export function toCss(d) {
  const lines = ['/* Written by remaster design from remaster/design/design.json. Change the JSON, not this file. */', ':root {'];
  /** @type {string[]} */
  const theme = [];
  for (const [k, v] of Object.entries(d.colors ?? {})) {
    lines.push(`  --${k}: ${v};`);
    theme.push(`  --color-${k}: var(--${k});`);
  }
  for (const [k, v] of Object.entries(d.rounded ?? {})) {
    lines.push(`  --radius-${k}: ${v};`);
    theme.push(`  --radius-${k}: var(--radius-${k});`);
  }
  for (const [k, v] of Object.entries(d.spacing ?? {})) lines.push(`  --space-${k}: ${typeof v === 'number' ? `${v}px` : v};`);
  for (const [k, t] of Object.entries(d.typography ?? {})) {
    const x = /** @type {any} */ (t);
    if (x.fontFamily) {
      lines.push(`  --font-${k}: ${x.fontFamily};`);
      theme.push(`  --font-${k}: var(--font-${k});`);
    }
    if (x.fontSize) {
      lines.push(`  --text-${k}: ${x.fontSize};`);
      theme.push(`  --text-${k}: var(--text-${k});`);
    }
    if (x.lineHeight) lines.push(`  --text-${k}--line-height: ${x.lineHeight};`);
    if (x.lineHeight) theme.push(`  --text-${k}--line-height: var(--text-${k}--line-height);`);
    if (x.fontWeight) lines.push(`  --text-${k}--font-weight: ${x.fontWeight};`);
    if (x.letterSpacing) lines.push(`  --text-${k}--letter-spacing: ${x.letterSpacing};`);
  }
  for (const [k, v] of Object.entries(d.elevation ?? {})) lines.push(`  --shadow-${k}: ${v};`);
  for (const [k, v] of Object.entries(d.motion ?? {})) lines.push(`  --motion-${k}: ${v};`);
  lines.push('}');
  if (d.dark) {
    lines.push('', '@media (prefers-color-scheme: dark) {', '  :root {');
    for (const [k, v] of Object.entries(d.dark)) lines.push(`    --${k}: ${v};`);
    lines.push('  }', '}');
  }
  lines.push('', '/* Tailwind v4 reads this; browsers skip it. */', '@theme inline {', ...theme, '}', '');
  return lines.join('\n');
}

/**
 * The design as W3C design tokens (the DTCG format), for Style Dictionary,
 * Tokens Studio and anything else that reads the standard.
 * @param {any} d
 */
export function toDtcg(d) {
  /** @type {Record<string, any>} */
  const out = { $description: `${d.name ?? 'Design'} tokens, written by remaster design` };
  out.color = Object.fromEntries(Object.entries(d.colors ?? {}).map(([k, v]) => [k, { $type: 'color', $value: v }]));
  if (d.dark) out['color-dark'] = Object.fromEntries(Object.entries(d.dark).map(([k, v]) => [k, { $type: 'color', $value: v }]));
  out.radius = Object.fromEntries(Object.entries(d.rounded ?? {}).map(([k, v]) => [k, { $type: 'dimension', $value: v }]));
  out.spacing = Object.fromEntries(Object.entries(d.spacing ?? {}).map(([k, v]) => [k, { $type: 'dimension', $value: typeof v === 'number' ? `${v}px` : v }]));
  out.typography = Object.fromEntries(
    Object.entries(d.typography ?? {}).map(([k, t]) => {
      const x = /** @type {any} */ (t);
      return [k, { $type: 'typography', $value: { fontFamily: x.fontFamily, fontSize: x.fontSize, fontWeight: x.fontWeight, lineHeight: x.lineHeight, letterSpacing: x.letterSpacing ?? '0' } }];
    }),
  );
  if (d.elevation) out.shadow = Object.fromEntries(Object.entries(d.elevation).map(([k, v]) => [k, { $type: 'shadow', $value: v }]));
  if (d.motion) out.motion = Object.fromEntries(Object.entries(d.motion).map(([k, v]) => [k, { $type: /ms$|s$/.test(String(v)) ? 'duration' : 'cubicBezier', $value: v }]));
  return out;
}

/**
 * The design as a shadcn/ui theme. shadcn's names mean different things from
 * Remaster's: its "primary" is the brand color (our accent), and its
 * "accent" is the quiet hover background (our surface).
 * @param {any} d
 */
export function toShadcn(d) {
  /** @param {Record<string, string>} c */
  const vars = (c) => {
    const pick = (/** @type {string[]} */ ...keys) => keys.map((k) => c[k]).find(Boolean);
    return {
      background: pick('canvas'),
      foreground: pick('ink'),
      card: pick('surface', 'canvas'),
      'card-foreground': pick('ink'),
      popover: pick('surface', 'canvas'),
      'popover-foreground': pick('ink'),
      primary: pick('accent'),
      'primary-foreground': pick('on-accent'),
      secondary: pick('surface', 'canvas'),
      'secondary-foreground': pick('ink'),
      muted: pick('surface', 'canvas'),
      'muted-foreground': pick('ink-soft', 'ink'),
      accent: pick('surface', 'canvas'),
      'accent-foreground': pick('ink'),
      destructive: pick('danger'),
      border: pick('border'),
      input: pick('border-input', 'border'),
      ring: pick('accent'),
    };
  };
  const block = (/** @type {Record<string, string | undefined>} */ v, /** @type {string} */ indent) =>
    Object.entries(v)
      .filter(([, x]) => x)
      .map(([k, x]) => `${indent}--${k}: ${x};`)
      .join('\n');
  const radius = (d.rounded ?? {}).md ?? Object.values(d.rounded ?? {}).find((r) => !/9999|50%/.test(String(r))) ?? '0.5rem';
  const lines = [
    '/* Written by remaster design: your design as a shadcn/ui theme. Paste over the :root and .dark blocks in your globals.css. */',
    ':root {',
    `  --radius: ${radius};`,
    block(vars(d.colors ?? {}), '  '),
    '}',
  ];
  if (d.dark) lines.push('', '.dark {', block(vars({ ...(d.colors ?? {}), ...d.dark }), '  '), '}');
  return lines.join('\n') + '\n';
}

/** @param {{ flags: Record<string, string | boolean>, positionals: string[] }} args */
export async function run({ flags, positionals }) {
  const root = projectRoot();
  const p = paths(root);
  const file = positionals[0] ? path.resolve(positionals[0]) : p.designJson;
  if (!exists(file)) fail(`No design file at ${rel(root, file)}. Copy templates/design.json from the skill, fill it in with the direction the user picked, then run this again.`);
  const d = readJson(file);
  const measuredFile = typeof flags.measured === 'string' ? path.resolve(flags.measured) : p.measured;
  const measured = exists(measuredFile) ? readJson(measuredFile) : null;
  const brand = exists(p.brand) ? readJson(p.brand) : {};
  const findings = lintDesign(d, measured, brand.colors ?? []);
  const errors = findings.filter((f) => f.level === 'error');

  if (flags.json) say(JSON.stringify({ findings }, null, 2));
  else {
    if (findings.length) say(table(['level', 'check', 'finding'], findings.map((f) => [f.level, f.rule, f.message])));
    else say('Every check passed.');
    if (!measured) say('\nNote: no measurement of the original (remaster/design/measured.json), so distance from its brand colors and typeface was not checked.');
  }
  if (errors.length) {
    if (!flags.json) say(`\n${errors.length} error(s). Fix design.json and run this again; nothing was written.`);
    return 1;
  }

  let out = typeof flags.out === 'string' ? path.resolve(flags.out) : p.designMd;
  if (exists(out) && !flags.force && !fs.readFileSync(out, 'utf8').includes(MARKER)) {
    out = path.join(p.design, 'DESIGN.md');
    if (!flags.json) say(`\nA DESIGN.md that Remaster didn't write is already at the project root, so it stays as it is. Writing ${rel(root, out)} instead (use --force to replace the root one).`);
  }
  writeText(out, toDesignMd(d));
  writeText(p.tokensCss, toCss(d));
  const dtcg = path.join(p.design, 'tokens.json');
  const shadcn = path.join(p.design, 'shadcn.css');
  writeText(dtcg, JSON.stringify(toDtcg(d), null, 2) + '\n');
  writeText(shadcn, toShadcn(d));
  if (!flags.json) say(`\nWrote ${rel(root, out)}, ${rel(root, p.tokensCss)}, ${rel(root, shadcn)} (a shadcn/ui theme) and ${rel(root, dtcg)} (W3C design tokens).`);
  return 0;
}
